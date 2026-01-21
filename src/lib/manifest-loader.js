import fs from "fs";
import path from "path";
import { logger } from "./logger.js";

/**
 * Loads and validates a manifest.json file from the specified directory
 * @param {string} courseDir - Path to the course directory
 * @returns {Object} Parsed manifest object
 * @throws {Error} If manifest not found or invalid
 */
export function loadManifest(courseDir) {
  const manifestPath = path.join(courseDir, "manifest.json");

  logger.info({ manifestPath }, "Looking for manifest.json");

  if (!fs.existsSync(manifestPath)) {
    const error = new Error(`manifest.json not found in ${courseDir}`);
    logger.error({ courseDir }, error.message);
    throw error;
  }

  try {
    const content = fs.readFileSync(manifestPath, "utf-8");
    // Remove single-line comments and trailing commas before closing brackets
    const cleanContent = content
      .split("\n")
      .map((line) => {
        // Remove single-line comments (but preserve strings)
        const commentIndex = line.indexOf("//");
        if (commentIndex !== -1) {
          // Check if it's not inside a string
          const beforeComment = line.substring(0, commentIndex);
          const quoteCount = (beforeComment.match(/"/g) || []).length;
          // If even number of quotes, comment is outside string
          if (quoteCount % 2 === 0) {
            return beforeComment;
          }
        }
        return line;
      })
      .join("\n")
      .replace(/,(\s*[}\]])/g, "$1"); // Remove trailing commas

    const manifest = JSON.parse(cleanContent);

    logger.info(
      { metadata: manifest.metadata },
      "Manifest loaded successfully"
    );

    // Validate required fields
    if (!manifest.instances) {
      throw new Error('manifest.json missing required "instances" field');
    }

    return manifest;
  } catch (error) {
    if (error instanceof SyntaxError) {
      logger.error({ manifestPath }, "Invalid JSON in manifest.json");
      throw new Error(`Invalid JSON in manifest.json: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Resolves instance patterns (e.g., "idx*") to specific instances
 * @param {Object} instances - Instances configuration from manifest
 * @param {Object} spec - Spec object with instance counts
 * @returns {Map} Map of instance names to their configurations
 */
export function resolveInstances(instances, spec) {
  const resolved = new Map();
  const instanceCounts = spec?.instances || {};

  // First pass: resolve specific instances and role-based wildcards
  for (const [pattern, config] of Object.entries(instances)) {
    if (pattern === "*") {
      // Skip the global wildcard for now, handle it in the second pass
      continue;
    }

    if (pattern.includes("*")) {
      // Handle wildcard patterns like "idx*"
      const prefix = pattern.replace("*", "");
      const count = instanceCounts[prefix];

      if (count) {
        for (let i = 1; i <= count; i++) {
          const instanceName = `${prefix}${i}`;
          if (!resolved.has(instanceName)) {
            resolved.set(instanceName, { apps: [], files: [], datagen: null });
          }
          const existing = resolved.get(instanceName);

          // Handle apps - support old array format, single object, and array of objects
          if (config.apps) {
            if (Array.isArray(config.apps)) {
              // Check if it's array of strings (old format) or array of objects (colocated roles)
              if (
                config.apps.length > 0 &&
                typeof config.apps[0] === "string"
              ) {
                // Old format: ["./app1", "./app2"]
                existing.apps.push(
                  ...config.apps.map((app) => ({
                    source: app,
                    destination: "apps"
                  }))
                );
              } else {
                // Array of objects for colocated roles: [{ source: [...], destination: "..." }, ...]
                for (const appGroup of config.apps) {
                  if (appGroup.source) {
                    const destination = appGroup.destination || "apps";
                    existing.apps.push(
                      ...appGroup.source.map((app) => ({
                        source: app,
                        destination
                      }))
                    );
                  }
                }
              }
            } else if (config.apps.source) {
              // Single object format: { source: ["./app1"], destination: "manager-apps" }
              const destination = config.apps.destination || "apps";
              existing.apps.push(
                ...config.apps.source.map((app) => ({
                  source: app,
                  destination
                }))
              );
            }
          }

          // Handle files in wildcard patterns
          if (config.files) {
            const destination = config.files.destination || "system/local";
            if (Array.isArray(config.files.source)) {
              existing.files.push(
                ...config.files.source.map((file) => ({
                  source: file,
                  destination
                }))
              );
            } else if (typeof config.files.source === "string") {
              existing.files.push({ source: config.files.source, destination });
            }
          }

          // Handle datagen/datagens in wildcard patterns - support both spellings
          const datagenConfig = config.datagens || config.datagen;
          if (datagenConfig) {
            if (Array.isArray(datagenConfig)) {
              existing.datagen = { source: datagenConfig, destination: null };
            } else if (datagenConfig.source) {
              existing.datagen = {
                source: datagenConfig.source,
                destination: datagenConfig.destination
              };
            }
          }
        }
      }
    } else {
      // Handle specific instances like "idx4", "sh1"
      if (!resolved.has(pattern)) {
        resolved.set(pattern, { apps: [], files: [], datagen: null });
      }
      const existing = resolved.get(pattern);

      // Handle apps - support old array format, single object, and array of objects
      if (config.apps) {
        if (Array.isArray(config.apps)) {
          // Check if it's array of strings (old format) or array of objects (colocated roles)
          if (config.apps.length > 0 && typeof config.apps[0] === "string") {
            // Old format: ["./app1", "./app2"]
            existing.apps.push(
              ...config.apps.map((app) => ({
                source: app,
                destination: "apps"
              }))
            );
          } else {
            // Array of objects for colocated roles: [{ source: [...], destination: "..." }, ...]
            for (const appGroup of config.apps) {
              if (appGroup.source) {
                const destination = appGroup.destination || "apps";
                existing.apps.push(
                  ...appGroup.source.map((app) => ({
                    source: app,
                    destination
                  }))
                );
              }
            }
          }
        } else if (config.apps.source) {
          // Single object format: { source: ["./app1"], destination: "manager-apps" }
          const destination = config.apps.destination || "apps";
          existing.apps.push(
            ...config.apps.source.map((app) => ({ source: app, destination }))
          );
        }
      }

      // Handle files - support both old string format and new array format
      if (config.files) {
        const destination = config.files.destination || "system/local";
        if (Array.isArray(config.files.source)) {
          // New format: { source: ["./file.conf"], destination: "system/local" }
          existing.files.push(
            ...config.files.source.map((file) => ({
              source: file,
              destination
            }))
          );
        } else if (typeof config.files.source === "string") {
          // Old format: { source: "./file.conf", destination: "local" }
          existing.files.push({ source: config.files.source, destination });
        }
      }

      // Handle datagen/datagens - support both spellings, old array format and new object format
      const datagenConfig = config.datagens || config.datagen;
      if (datagenConfig) {
        if (Array.isArray(datagenConfig)) {
          // Old format: ["TBD"] or placeholder
          existing.datagen = { source: datagenConfig, destination: null };
        } else if (datagenConfig.source) {
          // New format: { source: ["./script.py"], destination: "/opt/log" }
          existing.datagen = {
            source: datagenConfig.source,
            destination: datagenConfig.destination
          };
        }
      }
    }
  }

  // Second pass: apply global wildcard "*" to ALL instances
  if (instances["*"]) {
    const globalConfig = instances["*"];

    for (const [instanceName, existing] of resolved.entries()) {
      // Handle apps
      if (globalConfig.apps) {
        if (Array.isArray(globalConfig.apps)) {
          if (
            globalConfig.apps.length > 0 &&
            typeof globalConfig.apps[0] === "string"
          ) {
            // Old format: ["./app1", "./app2"]
            existing.apps.push(
              ...globalConfig.apps.map((app) => ({
                source: app,
                destination: "apps"
              }))
            );
          } else {
            // Array of objects for colocated roles
            for (const appGroup of globalConfig.apps) {
              if (appGroup.source) {
                const destination = appGroup.destination || "apps";
                existing.apps.push(
                  ...appGroup.source.map((app) => ({
                    source: app,
                    destination
                  }))
                );
              }
            }
          }
        } else if (globalConfig.apps.source) {
          // Single object format
          const destination = globalConfig.apps.destination || "apps";
          existing.apps.push(
            ...globalConfig.apps.source.map((app) => ({
              source: app,
              destination
            }))
          );
        }
      }

      // Handle files
      if (globalConfig.files) {
        const destination = globalConfig.files.destination || "system/local";
        if (Array.isArray(globalConfig.files.source)) {
          existing.files.push(
            ...globalConfig.files.source.map((file) => ({
              source: file,
              destination
            }))
          );
        } else if (typeof globalConfig.files.source === "string") {
          existing.files.push({
            source: globalConfig.files.source,
            destination
          });
        }
      }

      // Handle datagen/datagens
      const datagenConfig = globalConfig.datagens || globalConfig.datagen;
      if (datagenConfig) {
        if (Array.isArray(datagenConfig)) {
          existing.datagen = { source: datagenConfig, destination: null };
        } else if (datagenConfig.source) {
          existing.datagen = {
            source: datagenConfig.source,
            destination: datagenConfig.destination
          };
        }
      }
    }
  }

  return resolved;
}

/**
 * Updates the 'updated' field in the manifest metadata with the current date
 * @param {string} courseDir - Path to the course directory
 * @param {string} [customDate] - Optional custom date to use instead of current date (YYYY-MM-DD format)
 * @returns {void}
 * @throws {Error} If manifest not found or cannot be updated
 */
export function updateManifestDate(courseDir, customDate = null) {
  const manifestPath = path.join(courseDir, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    const error = new Error(`manifest.json not found in ${courseDir}`);
    logger.error({ courseDir }, error.message);
    throw error;
  }

  try {
    let content = fs.readFileSync(manifestPath, "utf-8");
    const dateToUse = customDate || new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

    // Check if 'updated' field exists
    if (/["']updated["']\s*:\s*["'][^"']*["']/.test(content)) {
      // Replace existing updated field while preserving formatting
      content = content.replace(
        /(["']updated["']\s*:\s*["'])([^"']+)(["'])/,
        `$1${dateToUse}$3`
      );
    } else {
      // Add the updated field after 'ga' field in metadata, or at the end of metadata
      const gaMatch = content.match(
        /(["']ga["']\s*:\s*["'][^"']*["'])(,?)(\s*)/m
      );
      if (gaMatch) {
        // Insert after 'ga' field
        content = content.replace(
          /(["']ga["']\s*:\s*["'][^"']*["'])(,?)(\s*)/m,
          `$1,\n    "updated": "${dateToUse}"$3`
        );
      } else {
        // Try to add it at the end of metadata object (before closing brace)
        const metadataMatch = content.match(/"metadata"\s*:\s*\{[^}]*\}/s);
        if (metadataMatch) {
          content = content.replace(
            /("metadata"\s*:\s*\{[^}]*)(\s*)(\})/s,
            `$1,\n    "updated": "${dateToUse}"$2$3`
          );
        }
      }
    }

    fs.writeFileSync(manifestPath, content, "utf-8");

    logger.info({ date: dateToUse, manifestPath }, "Updated manifest date");
  } catch (error) {
    logger.error(
      { manifestPath, error: error.message },
      "Failed to update manifest date"
    );
    throw new Error(`Failed to update manifest date: ${error.message}`);
  }
}
