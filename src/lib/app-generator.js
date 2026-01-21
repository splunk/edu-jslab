import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { logger } from "./logger.js";

/**
 * Generates Splunk apps in the dist directory based on manifest configuration
 * @param {string} courseDir - Path to the course directory
 * @param {Map} resolvedInstances - Map of instance names to their configurations
 * @param {Object} options - Generation options
 */
export function generateApps(courseDir, resolvedInstances, options = {}) {
  const distDir = path.join(courseDir, options.outputDir || "dist");

  logger.info(
    { distDir, instanceCount: resolvedInstances.size },
    "Starting app generation"
  );

  // Create dist directory
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  for (const [instanceName, config] of resolvedInstances) {
    generateInstanceApps(courseDir, distDir, instanceName, config);
  }

  logger.info("App generation completed");
}

/**
 * Generates apps for a specific instance
 * @param {string} courseDir - Path to the course directory
 * @param {string} distDir - Path to the dist directory
 * @param {string} instanceName - Name of the instance (e.g., "idx1")
 * @param {Object} config - Instance configuration
 */
function generateInstanceApps(courseDir, distDir, instanceName, config) {
  const instanceDir = path.join(distDir, instanceName);

  logger.info(
    { instance: instanceName },
    `Generating apps for ${instanceName}`
  );

  if (!fs.existsSync(instanceDir)) {
    fs.mkdirSync(instanceDir, { recursive: true });
  }

  // Process apps
  if (config.apps && config.apps.length > 0) {
    for (const appConfig of config.apps) {
      copyApp(courseDir, instanceDir, appConfig, instanceName);
    }
  }

  // Process individual files
  if (config.files && config.files.length > 0) {
    for (const fileConfig of config.files) {
      copyFile(courseDir, instanceDir, fileConfig, instanceName);
    }
  }

  // Process datagen
  if (config.datagen && config.datagen.source) {
    for (const datagenPath of config.datagen.source) {
      if (datagenPath === "TBD" || !datagenPath) {
        logger.warn(
          { instance: instanceName },
          "datagen placeholder found - skipping"
        );
        continue;
      }
      copyDatagen(
        courseDir,
        instanceDir,
        datagenPath,
        config.datagen.destination,
        instanceName
      );
    }
  }
}

/**
 * Copies an app directory to the instance directory
 * @param {string} courseDir - Path to the course directory
 * @param {string} instanceDir - Path to the instance directory
 * @param {Object} appConfig - App configuration with source and destination
 * @param {string} instanceName - Name of the instance
 */
function copyApp(courseDir, instanceDir, appConfig, instanceName) {
  const appPath = appConfig.source;
  const destination = appConfig.destination || "apps";

  // Handle different path types
  if (appPath.startsWith("http://") || appPath.startsWith("https://")) {
    logger.warn(
      { instance: instanceName, url: appPath },
      "HTTP/HTTPS app sources not yet supported"
    );
    return;
  }

  const resolvedAppPath = path.resolve(courseDir, appPath);

  if (!fs.existsSync(resolvedAppPath)) {
    logger.error(
      { instance: instanceName, appPath: resolvedAppPath },
      "App source not found"
    );
    return;
  }

  const appName = path.basename(resolvedAppPath);
  const destDir = path.join(instanceDir, destination);
  const destPath = path.join(destDir, appName);

  logger.info(
    { instance: instanceName, app: appName, destination },
    `Copying app ${appName} to ${destination}`
  );

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  copyRecursive(resolvedAppPath, destPath);
}

/**
 * Copies an individual file to the instance directory
 * @param {string} courseDir - Path to the course directory
 * @param {string} instanceDir - Path to the instance directory
 * @param {Object} fileConfig - File configuration with source and destination
 * @param {string} instanceName - Name of the instance
 */
function copyFile(courseDir, instanceDir, fileConfig, instanceName) {
  const sourcePath = path.resolve(courseDir, fileConfig.source);

  if (!fs.existsSync(sourcePath)) {
    logger.error(
      { instance: instanceName, source: sourcePath },
      "File source not found"
    );
    return;
  }

  const fileName = path.basename(sourcePath);
  // Handle destination - if it already includes 'system/', use as-is, otherwise prepend 'system/'
  let destDir;
  if (fileConfig.destination.startsWith("system/")) {
    destDir = path.join(instanceDir, fileConfig.destination);
  } else {
    destDir = path.join(instanceDir, "system", fileConfig.destination);
  }
  const destPath = path.join(destDir, fileName);

  logger.info(
    {
      instance: instanceName,
      file: fileName,
      destination: fileConfig.destination
    },
    `Copying file ${fileName}`
  );

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.copyFileSync(sourcePath, destPath);
}

/**
 * Copies a datagen script to the instance directory
 * @param {string} courseDir - Path to the course directory
 * @param {string} instanceDir - Path to the instance directory
 * @param {string} datagenPath - Relative path to the datagen script
 * @param {string} destination - Destination path for the datagen
 * @param {string} instanceName - Name of the instance
 */
function copyDatagen(
  courseDir,
  instanceDir,
  datagenPath,
  destination,
  instanceName
) {
  const sourcePath = path.resolve(courseDir, datagenPath);

  if (!fs.existsSync(sourcePath)) {
    logger.error(
      { instance: instanceName, source: sourcePath },
      "Datagen source not found"
    );
    return;
  }

  const fileName = path.basename(sourcePath);
  // Create datagen directory structure
  const destDir = path.join(instanceDir, "datagen");
  const destPath = path.join(destDir, fileName);

  logger.info(
    { instance: instanceName, datagen: fileName, destination },
    `Copying datagen ${fileName}`
  );

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Copy the datagen (could be file or directory)
  const stats = fs.statSync(sourcePath);
  if (stats.isDirectory()) {
    copyRecursive(sourcePath, destPath);
  } else {
    fs.copyFileSync(sourcePath, destPath);
  }

  // Store metadata about where it should be deployed
  if (destination) {
    const metadataPath = path.join(destDir, "datagen-metadata.json");
    const metadata = {
      [fileName]: {
        destination: destination
      }
    };

    // Append to existing metadata if file exists
    let existingMetadata = {};
    if (fs.existsSync(metadataPath)) {
      existingMetadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    }

    fs.writeFileSync(
      metadataPath,
      JSON.stringify({ ...existingMetadata, ...metadata }, null, 2)
    );
  }
}

/**
 * Recursively copies a directory
 * @param {string} src - Source directory path
 * @param {string} dest - Destination directory path
 */
function copyRecursive(src, dest) {
  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

/**
 * Cleans the dist directory
 * @param {string} courseDir - Path to the course directory
 * @param {Object} options - Options with outputDir
 */
export function cleanDist(courseDir, options = {}) {
  const distDir = path.join(courseDir, options.outputDir || "dist");

  if (fs.existsSync(distDir)) {
    logger.info({ distDir }, "Cleaning dist directory");
    fs.rmSync(distDir, { recursive: true, force: true });
  }
}

/**
 * Packages apps as tar.gz archives within each instance directory
 * @param {string} distDir - Path to the dist directory
 * @param {Map} resolvedInstances - Map of instance names to their configurations
 * @param {boolean} removeOriginal - Whether to remove original directories after packaging
 */
export function packageApps(
  distDir,
  resolvedInstances,
  removeOriginal = false
) {
  for (const [instanceName] of resolvedInstances) {
    const instanceDir = path.join(distDir, instanceName);

    if (!fs.existsSync(instanceDir)) continue;

    // Find all app directories (excluding system, datagen, etc.)
    const entries = fs.readdirSync(instanceDir);

    for (const entry of entries) {
      const entryPath = path.join(instanceDir, entry);
      const stats = fs.statSync(entryPath);

      // Skip non-directories and special folders
      if (!stats.isDirectory() || ["system", "datagen"].includes(entry)) {
        continue;
      }

      // Check if this is an app directory (has subdirectories)
      const subEntries = fs.readdirSync(entryPath);
      const hasSubdirs = subEntries.some((sub) => {
        const subPath = path.join(entryPath, sub);
        return fs.statSync(subPath).isDirectory();
      });

      if (hasSubdirs) {
        // This is a destination folder (apps, manager-apps, etc.) - tar each app inside
        for (const appName of subEntries) {
          const appPath = path.join(entryPath, appName);
          if (fs.statSync(appPath).isDirectory()) {
            tarDirectory(entryPath, appName, instanceName, removeOriginal);
          }
        }
      } else {
        // This is an app directory at the root level - tar it
        tarDirectory(instanceDir, entry, instanceName, removeOriginal);
      }
    }
  }
}

/**
 * Packages entire instance directories as tar.gz archives
 * @param {string} distDir - Path to the dist directory
 * @param {Map} resolvedInstances - Map of instance names to their configurations
 * @param {boolean} removeOriginal - Whether to remove original directories after packaging
 */
export function packageInstances(
  distDir,
  resolvedInstances,
  removeOriginal = false
) {
  for (const [instanceName] of resolvedInstances) {
    const instanceDir = path.join(distDir, instanceName);

    if (!fs.existsSync(instanceDir)) continue;

    tarDirectory(distDir, instanceName, "instances", removeOriginal);
  }
}

/**
 * Creates a tar.gz archive of a directory
 * @param {string} parentDir - Parent directory containing the target
 * @param {string} targetName - Name of the directory to tar
 * @param {string} context - Context for logging (instance name or 'instances')
 * @param {boolean} removeOriginal - Whether to remove original directory after packaging
 */
function tarDirectory(parentDir, targetName, context, removeOriginal = false) {
  const targetPath = path.join(parentDir, targetName);
  const tarFile = `${targetName}.tar.gz`;
  const tarPath = path.join(parentDir, tarFile);

  try {
    // Use COPYFILE_DISABLE=1 to avoid macOS extended attributes
    const cmd = `cd "${parentDir}" && COPYFILE_DISABLE=1 tar --format ustar -czf "${tarFile}" "${targetName}"`;

    execSync(cmd, { stdio: "pipe" });

    logger.info({ context, archive: tarFile }, `Created ${tarFile}`);

    // Remove original directory if requested
    if (removeOriginal) {
      fs.rmSync(targetPath, { recursive: true, force: true });
      logger.debug(
        { context, target: targetName },
        "Removed original directory"
      );
    }
  } catch (error) {
    logger.error(
      { context, target: targetName, error: error.message },
      `Failed to create tar archive`
    );
  }
}
