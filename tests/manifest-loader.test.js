import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  loadManifest,
  resolveInstances,
  updateManifestDate
} from "../src/lib/manifest-loader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("manifest-loader", () => {
  const fixturesDir = path.join(__dirname, "fixtures");

  describe("loadManifest", () => {
    it("should load a valid manifest.json file", () => {
      const courseDir = path.join(fixturesDir, "cluster-course");
      const manifest = loadManifest(courseDir);

      expect(manifest).toBeDefined();
      expect(manifest.metadata).toBeDefined();
      expect(manifest.metadata.courseId).toBe("0061");
      expect(manifest.instances).toBeDefined();
    });

    it("should throw error when manifest.json not found", () => {
      const courseDir = path.join(fixturesDir, "nonexistent");

      expect(() => loadManifest(courseDir)).toThrow("manifest.json not found");
    });

    it("should handle JSON with comments", () => {
      const courseDir = path.join(fixturesDir, "cluster-course");
      const manifest = loadManifest(courseDir);

      // Should successfully parse despite comments in the file
      expect(manifest.instances).toBeDefined();
      expect(manifest.instances["cm*"]).toBeDefined();
    });
  });

  describe("resolveInstances", () => {
    it("should resolve wildcard patterns to specific instances", () => {
      const instances = {
        "idx*": {
          apps: {
            source: ["./apps/idx-base-config"],
            destination: "apps"
          }
        }
      };
      const spec = {
        instances: {
          idx: 4
        }
      };

      const resolved = resolveInstances(instances, spec);

      expect(resolved.size).toBe(4);
      expect(resolved.has("idx1")).toBe(true);
      expect(resolved.has("idx2")).toBe(true);
      expect(resolved.has("idx3")).toBe(true);
      expect(resolved.has("idx4")).toBe(true);
      expect(resolved.get("idx1").apps[0].source).toBe(
        "./apps/idx-base-config"
      );
      expect(resolved.get("idx1").apps[0].destination).toBe("apps");
    });

    it("should handle old array format for backward compatibility", () => {
      const instances = {
        "sh*": {
          apps: ["./apps/sh-base"]
        }
      };
      const spec = {
        instances: {
          sh: 2
        }
      };

      const resolved = resolveInstances(instances, spec);

      expect(resolved.size).toBe(2);
      expect(resolved.get("sh1").apps[0].source).toBe("./apps/sh-base");
      expect(resolved.get("sh1").apps[0].destination).toBe("apps");
    });

    it("should handle specific instance configurations", () => {
      const instances = {
        idx4: {
          files: {
            source: ["./idx4/server.conf"],
            destination: "system/local"
          }
        }
      };
      const spec = { instances: {} };

      const resolved = resolveInstances(instances, spec);

      expect(resolved.size).toBe(1);
      expect(resolved.has("idx4")).toBe(true);
      expect(resolved.get("idx4").files).toHaveLength(1);
      expect(resolved.get("idx4").files[0].source).toBe("./idx4/server.conf");
    });

    it("should merge wildcard and specific configurations", () => {
      const instances = {
        "idx*": {
          apps: {
            source: ["./apps/idx-base-config"],
            destination: "manager-apps"
          }
        },
        idx4: {
          files: {
            source: ["./idx4/server.conf"],
            destination: "system/local"
          }
        }
      };
      const spec = {
        instances: {
          idx: 4
        }
      };

      const resolved = resolveInstances(instances, spec);

      expect(resolved.size).toBe(4);
      expect(resolved.get("idx4").apps[0].source).toBe(
        "./apps/idx-base-config"
      );
      expect(resolved.get("idx4").files).toHaveLength(1);
      expect(resolved.get("idx4").files[0].source).toBe("./idx4/server.conf");
    });

    it("should handle colocated roles with apps array format", () => {
      const instances = {
        lm1: {
          apps: [
            {
              source: ["./apps/uf-base"],
              destination: "deployment-apps"
            },
            {
              source: ["./apps/sh-base"],
              destination: "shcluster/apps"
            }
          ]
        }
      };
      const spec = { instances: {} };

      const resolved = resolveInstances(instances, spec);

      expect(resolved.size).toBe(1);
      expect(resolved.has("lm1")).toBe(true);
      expect(resolved.get("lm1").apps).toHaveLength(2);
      expect(resolved.get("lm1").apps[0].source).toBe("./apps/uf-base");
      expect(resolved.get("lm1").apps[0].destination).toBe("deployment-apps");
      expect(resolved.get("lm1").apps[1].source).toBe("./apps/sh-base");
      expect(resolved.get("lm1").apps[1].destination).toBe("shcluster/apps");
    });

    it("should handle global wildcard (*) to apply config to all instances", () => {
      const instances = {
        "*": {
          files: {
            source: ["./files/health.conf"],
            destination: "system/local"
          }
        },
        "idx*": {
          apps: {
            source: ["./apps/idx-base"],
            destination: "apps"
          }
        },
        "sh*": {
          apps: {
            source: ["./apps/sh-base"],
            destination: "apps"
          }
        }
      };
      const spec = {
        instances: {
          idx: 2,
          sh: 1
        }
      };

      const resolved = resolveInstances(instances, spec);

      // Should have 3 instances total (idx1, idx2, sh1)
      expect(resolved.size).toBe(3);

      // All instances should have the global file
      expect(resolved.get("idx1").files).toHaveLength(1);
      expect(resolved.get("idx1").files[0].source).toBe("./files/health.conf");
      expect(resolved.get("idx2").files).toHaveLength(1);
      expect(resolved.get("idx2").files[0].source).toBe("./files/health.conf");
      expect(resolved.get("sh1").files).toHaveLength(1);
      expect(resolved.get("sh1").files[0].source).toBe("./files/health.conf");

      // idx instances should have both global file and idx-specific app
      expect(resolved.get("idx1").apps).toHaveLength(1);
      expect(resolved.get("idx1").apps[0].source).toBe("./apps/idx-base");

      // sh1 should have both global file and sh-specific app
      expect(resolved.get("sh1").apps).toHaveLength(1);
      expect(resolved.get("sh1").apps[0].source).toBe("./apps/sh-base");
    });

    it("should apply global wildcard to specific instances too", () => {
      const instances = {
        "*": {
          apps: {
            source: ["./apps/common"],
            destination: "apps"
          }
        },
        lm1: {
          files: {
            source: ["./lm1/server.conf"],
            destination: "system/local"
          }
        }
      };
      const spec = { instances: {} };

      const resolved = resolveInstances(instances, spec);

      expect(resolved.size).toBe(1);
      expect(resolved.has("lm1")).toBe(true);

      // lm1 should have both the global app and its specific file
      expect(resolved.get("lm1").apps).toHaveLength(1);
      expect(resolved.get("lm1").apps[0].source).toBe("./apps/common");
      expect(resolved.get("lm1").files).toHaveLength(1);
      expect(resolved.get("lm1").files[0].source).toBe("./lm1/server.conf");
    });
  });

  describe("updateManifestDate", () => {
    const testDir = path.join(fixturesDir, "test-update-date");
    const testManifestPath = path.join(testDir, "manifest.json");

    beforeEach(() => {
      // Create a test manifest file
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      const testManifest = {
        metadata: {
          courseId: "0001",
          updated: "2025-01-01"
        },
        instances: {}
      };
      fs.writeFileSync(testManifestPath, JSON.stringify(testManifest, null, 2));
    });

    afterEach(() => {
      // Clean up test directory
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("should update the updated field with current date", () => {
      updateManifestDate(testDir);

      const content = fs.readFileSync(testManifestPath, "utf-8");
      const manifest = JSON.parse(content);

      const today = new Date().toISOString().split("T")[0];
      expect(manifest.metadata.updated).toBe(today);
    });

    it("should update with custom date when provided", () => {
      const customDate = "2026-12-25";
      updateManifestDate(testDir, customDate);

      const content = fs.readFileSync(testManifestPath, "utf-8");
      const manifest = JSON.parse(content);

      expect(manifest.metadata.updated).toBe(customDate);
    });

    it("should add updated field if it does not exist", () => {
      // Create manifest without updated field
      const testManifest = {
        metadata: {
          courseId: "0001",
          ga: "2025-11-01"
        },
        instances: {}
      };
      fs.writeFileSync(testManifestPath, JSON.stringify(testManifest, null, 2));

      updateManifestDate(testDir);

      const content = fs.readFileSync(testManifestPath, "utf-8");
      const manifest = JSON.parse(content);

      const today = new Date().toISOString().split("T")[0];
      expect(manifest.metadata.updated).toBe(today);
    });

    it("should preserve file formatting", () => {
      const originalContent = fs.readFileSync(testManifestPath, "utf-8");
      updateManifestDate(testDir);
      const updatedContent = fs.readFileSync(testManifestPath, "utf-8");

      // Should maintain same structure, just different date
      expect(updatedContent).toContain('"courseId": "0001"');
      expect(updatedContent).toContain('"updated":');
    });

    it("should throw error when manifest not found", () => {
      const nonexistentDir = path.join(fixturesDir, "nonexistent-dir");
      expect(() => updateManifestDate(nonexistentDir)).toThrow(
        "manifest.json not found"
      );
    });
  });
});
