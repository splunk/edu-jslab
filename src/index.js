#!/usr/bin/env node

import { Command } from "commander";
import path from "path";
import { logger } from "./lib/logger.js";
import {
  loadManifest,
  resolveInstances,
  updateManifestDate
} from "./lib/manifest-loader.js";
import {
  generateApps,
  cleanDist,
  packageApps,
  packageInstances
} from "./lib/app-generator.js";

const program = new Command();

program
  .name("json2lab")
  .description(
    "Generate Splunk lab environment apps from manifest configuration"
  )
  .version("1.0.0")
  .argument(
    "<coursedir>",
    "Path to the course directory containing manifest.json"
  )
  .option("-o, --output-dir <dir>", "Output directory name", "dist")
  .option("-c, --clean", "Remove original directories after packaging", false)
  .option("-d, --date <date>", "Override the updated date (YYYY-MM-DD format)")
  .option(
    "-t, --tar <target>",
    "Package as tar.gz archives: apps, instances, or all"
  )
  .option("-v, --verbose", "Enable verbose logging", false)
  .option(
    "--dry-run",
    "Show what would be generated without creating files",
    false
  )
  .action((coursedir, options) => {
    try {
      // Set log level
      if (options.verbose) {
        logger.level = "debug";
      }

      const courseDir = path.resolve(coursedir);
      logger.info({ courseDir }, "Starting json2lab");

      // Always update manifest date (with optional custom date)
      updateManifestDate(courseDir, options.date);

      // Always clean dist directory before generating
      cleanDist(courseDir, options);

      // Load and parse manifest
      const manifest = loadManifest(courseDir);

      // Resolve instance configurations
      const resolvedInstances = resolveInstances(
        manifest.instances,
        manifest.spec
      );

      logger.debug(
        { instances: Array.from(resolvedInstances.keys()) },
        "Resolved instances"
      );

      if (options.dryRun) {
        logger.info("Dry run - showing configuration:");
        for (const [instanceName, config] of resolvedInstances) {
          console.log(`\n${instanceName}:`);
          if (config.apps?.length > 0) {
            console.log("  Apps:");
            config.apps.forEach((app) => console.log(`    - ${app}`));
          }
          if (config.files?.length > 0) {
            console.log("  Files:");
            config.files.forEach((file) =>
              console.log(`    - ${file.source} -> ${file.destination}`)
            );
          }
          if (config.datagen) {
            console.log("  Datagen:", config.datagen);
          }
        }
        return;
      }

      // Generate apps
      generateApps(courseDir, resolvedInstances, options);

      // Package as tarballs if requested
      if (options.tar) {
        const distDir = path.join(courseDir, options.outputDir || "dist");

        if (options.tar === "apps" || options.tar === "all") {
          logger.info("Packaging apps as tar.gz archives");
          packageApps(distDir, resolvedInstances, options.clean);
        }

        if (options.tar === "instances" || options.tar === "all") {
          logger.info("Packaging instances as tar.gz archives");
          packageInstances(distDir, resolvedInstances, options.clean);
        }
      }

      logger.info("✓ Successfully generated lab environment apps");
    } catch (error) {
      logger.error({ error: error.message }, "Failed to generate apps");
      process.exit(1);
    }
  });

program.parse();
