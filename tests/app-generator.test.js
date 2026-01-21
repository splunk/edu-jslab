import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateApps, cleanDist } from "../src/lib/app-generator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("app-generator", () => {
  const fixturesDir = path.join(__dirname, "fixtures");
  const testCourseDir = path.join(fixturesDir, "cluster-course");
  const distDir = path.join(testCourseDir, "dist");

  beforeEach(() => {
    // Clean dist directory before each test
    if (fs.existsSync(distDir)) {
      fs.rmSync(distDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up after tests
    if (fs.existsSync(distDir)) {
      fs.rmSync(distDir, { recursive: true, force: true });
    }
  });

  describe("generateApps", () => {
    it("should create dist directory if it does not exist", () => {
      const resolvedInstances = new Map();
      resolvedInstances.set("idx1", { apps: [], files: [], datagen: null });

      generateApps(testCourseDir, resolvedInstances);

      expect(fs.existsSync(distDir)).toBe(true);
    });

    it("should create instance directories", () => {
      const resolvedInstances = new Map();
      resolvedInstances.set("idx1", { apps: [], files: [], datagen: null });
      resolvedInstances.set("sh1", { apps: [], files: [], datagen: null });

      generateApps(testCourseDir, resolvedInstances);

      expect(fs.existsSync(path.join(distDir, "idx1"))).toBe(true);
      expect(fs.existsSync(path.join(distDir, "sh1"))).toBe(true);
    });

    it("should handle file configurations", () => {
      const resolvedInstances = new Map();
      resolvedInstances.set("sh3", {
        apps: [],
        files: [
          {
            source: "./sh3/server.conf",
            destination: "system/local"
          }
        ],
        datagen: null
      });

      generateApps(testCourseDir, resolvedInstances);

      const targetFile = path.join(
        distDir,
        "sh3",
        "system",
        "local",
        "server.conf"
      );
      expect(fs.existsSync(targetFile)).toBe(true);
    });
  });

  describe("cleanDist", () => {
    it("should remove existing dist directory", () => {
      // Create a dist directory
      fs.mkdirSync(distDir, { recursive: true });
      fs.writeFileSync(path.join(distDir, "test.txt"), "test");

      expect(fs.existsSync(distDir)).toBe(true);

      cleanDist(testCourseDir);

      expect(fs.existsSync(distDir)).toBe(false);
    });

    it("should not throw error if dist does not exist", () => {
      expect(() => cleanDist(testCourseDir)).not.toThrow();
    });
  });
});
