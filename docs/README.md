# RTFM

Generate Splunk EDU lab environment instance configurations from a JSON manifest.

## Using jslab

Run the following command:

```sh
jslab /path/to/lab/configs/dir
```

To see available options, run:

```sh
jslab --help
```

Or simply:

```sh
jslab -h
```

## Creating a `manifest.json` file

Create a `manifest.json` in your course lab config folder or repository. `jslab` requires two objects in your `manifest.json`:

- `spec`
- `instances`

This guide will be using a hypothetical clustered environment to demonstrate the configuration options. Here's the full `manifest.json`:

```json
{
  "metadata": {
    "courseId": "1234",
    "courseTitle": "Splunk Enterprise Cluster Administration",
    "slug": "cluster-admin",
    "description": "Cluster fun!",
    "courseDeveloper": "Buttercup Pwny",
    "modality": "ILT",
    "duration": "13.5 hours",
    "audience": {
      "role": ["sysadmin", "power user"],
      "internal": ["professional services"],
      "external": ["customer-facing", "partners"]
    },
    "ga": "2025-11-01",
    "updated": "2026-01-21",
    "splunk": {
      "platform": {
        "deployment": "Enterprise",
        "version": "10.2.0"
      }
    }
  },
  "spec": {
    "instances": {
      "idx": 4,
      "sh": 3,
      "cm": 2,
      "mc": 1,
      "uf": 1,
      "lm": 1
    },
    "notes": ["The deployment server is colocated on lm1 instance."]
  },
  "instances": {
    "*": {
      "files": {
        "source": ["./files/health.conf"],
        "destination": "system/local"
      }
    },
    "sh*": {
      "apps": {
        "source": ["./apps/sh-base-config"],
        "destination": "apps"
      }
    },
    "sh3": {
      "files": {
        "source": ["./sh3/server.conf"],
        "destination": "system/local"
      }
    },
    "cm*": {
      "apps": {
        "source": ["./apps/idx-base-config", "./apps/idx-transforms"],
        "destination": "manager-apps"
      },
      "files": {
        "source": ["./cm/server.conf"],
        "destination": "system/local"
      }
    },
    "uf*": {
      "datagens": {
        "source": ["./datagens/better-than-bad-log"],
        "destination": "/opt/log/"
      },
      "apps": {
        "source": ["./apps/uf-transforms"],
        "destination": "apps"
      }
    },
    "lm*": {
      "apps": [
        {
          "source": ["./apps/uf-base"],
          "destination": "deployment-apps"
        },
        {
          "source": ["./apps/sh-base-config"],
          "destination": "shcluster/apps"
        }
      ]
    }
  }
}
```

Let's break it down!

### Defining the "spec" object

The `spec` object contains the specification for the lab environment. It requires an `instances` object and accepts an optional `notes` array.

Use the `instances` object to specify the instances and their quantities as key / value pairs:

```json
 "spec": {
        "instances": {
            "idx": 4,
            "sh": 3,
            "cm": 2,
            "mc": 1,
            "uf": 1,
            "lm": 1
        },
        "notes": [
            "The license manager, deployment server and deployer are colocated on lm1 instance.",
        ]
    },
```

Use these naming abbreviations:

- idx: indexer
- sh: search head
- cm: cluster manager
- mc: Monitoring Console
- uf: universal forwarder
- hf: heavy forwarder
- lm: license manager
- ds: Deployment Server

Don't specify the instance number, such as `idx1`, only the prefix, `idx`. The tool will append and increment numerical values for you.

Use the `notes` array for any information that will be helpful to ops folks or future course developers (including yourself!) when working with your configs.

### Defining the "instances" object

The `instances` object contains specification for the individual instances declared in the `spec` object.

Use the `*` wild card alone to define apps or files to be included on ALL instances:

```json
  "instances": {
    "*": {
      "files": {
        "source": ["./files/health.conf"],
        "destination": "system/local"
      }
    },
```

This will bundle the configuration in every instance in your environment.

The `source` paths are relative to your `manifest.json` file. In the example above, the `health.conf` file is in a `files` directory folder alongside the manifest.

Use the `destination` key to specify where, under `$SPLUNK_HOME/etc`, the apps or files will be installed. In the example above, the `health.conf` file will be installed in `$SPLUNK_HOME/etc/system/local`.

Use the `*` wild card with a role prefix to define apps to be included on all instances of a given role. For example:

```json
    "sh*": {
      "apps": {
        "source": ["./apps/sh-base-config"],
        "destination": "apps"
      }
    },
```

In the example above, the `sh-base-config` app will be installed directly on all search heads.

Use the standard installation locations for other roles:

- `manager-apps`
- `deployment-apps`
- `shcluster/apps`

Specify specific files to be installed on specific instances:

```json
    "sh3": {
      "files": {
        "source": ["./sh3/server.conf"],
        "destination": "system/local"
      }
    },
```

In the example above, the `sh-base-config` will still be installed on `sh3` as well as the specified `server.conf`, but this `server.conf` will not be installed on all of the other search heads.

Specify both apps _and_ files:

```json
    "cm*": {
      "apps": {
        "source": ["./apps/idx-base-config", "./apps/idx-transforms"],
        "destination": "manager-apps"
      },
      "files": {
        "source": ["./cm/server.conf"],
        "destination": "system/local"
      }
    },
```

Specify datagens to be installed on forwarders using the "datagens" key:

```json
    "uf*": {
      "datagens": {
        "source": ["./datagens/better-than-bad-log"],
        "destination": "/opt/log/"
      },
      "apps": {
        "source": ["./apps/uf-transforms"],
        "destination": "apps"
      }
    },
```

Specify multiple app locations on a single instance using an array of objects:

```json
    "lm*": {
      "apps": [
        {
          "source": ["./apps/uf-base"],
          "destination": "deployment-apps"
        },
        {
          "source": ["./apps/sh-base-config"],
          "destination": "shcluster/apps"
        }
      ]
    }
```

In the example above, `lm1` is performing multiple roles as the License Manager, the Deployment Server and the Deployer.

## Packing apps and instance configs

Package individual apps as .tar.gz:

```sh
jslab ./course -t apps
```

This preserves the original directory.

To remove the uncompressed app directory from the output, use the `-c`, or `--clean` option, to _clean_ your output:

```sh
jslab ./course -t apps -c
```

Package entire instance folders as .tar.gz:

```sh
jslab ./course -t instances
```

This creates compressed instance folders, for example:

- dist/sh1.tar.gz
- dist/idx1.tar.gz
- etc.

Package everything:

```sh
jslab ./course -t all
```

Both apps and instances are packaged.
