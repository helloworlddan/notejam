import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

const config = new pulumi.Config();

const projectName = process.env.NOTEJAM_PROJECT_NAME || config.require('project_name');
const projectNumber = process.env.NOTEJAM_PROJECT_NUMBER || config.require('project_number');
const locationName = process.env.NOTEJAM_LOCATION || config.require('location');
const repositoryName = process.env.NOTEJAM_REPOSITORY_NAME || config.require('repository');
const dbUser = process.env.NOTEJAM_DB_PASS || config.require('db_user');
const dbPass = process.env.NOTEJAM_DB_PASS || config.require('db_pass');
const dbHighAvailability = process.env.NOTEJAM_DB_HA || config.require('db_ha');
const dbNodesize = process.env.NOTEJAM_DB_NODE_SIZE || config.require('db_node_size');
const repositoryOwner = process.env.NOTEJAM_REPOSITORY_OWNER || config.require('owner');
const branchName = process.env.NOTEJAM_BRANCH_NAME || config.require('branch');

const stageName = process.env.NOTEJAM_STAGE_NAME || pulumi.getStack();
const appName = process.env.NOTEJAM_APP_NAME || `notejam-${stageName}`;
const imageName = process.env.NOTEJAM_IMAGE_NAME || `gcr.io/${projectName}/${appName}`;

// Enable required services
[
    'servicenetworking.googleapis.com',
    'run.googleapis.com',
    'cloudbuild.googleapis.com',
    'compute.googleapis.com',
    'containerregistry.googleapis.com',
    'serviceusage.googleapis.com',
    'sql-component.googleapis.com',
    'sqladmin.googleapis.com',
].forEach(function(value) {
    new gcp.projects.Service(value, {
        project: projectName,
        service: value,
        disableDependentServices: false,
    });
});

// Config for single node
var databaseConfig = {
    project: projectName,
    databaseVersion: "POSTGRES_9_6",
    region: locationName,
    settings: {
        tier: dbNodesize,
        availabilityType: "ZONAL",
        backupConfiguration: {
            binaryLogEnabled: false,
            enabled: false,
        },
    },
};

if (Boolean(dbHighAvailability) == false) {
    // Config for regional standby
    databaseConfig = {
        project: projectName,
        databaseVersion: "POSTGRES_9_6",
        region: locationName,
        settings: {
            tier: dbNodesize,
            availabilityType: "REGIONAL",
            backupConfiguration: {
                binaryLogEnabled: true,
                enabled: true,
            },
        },
    };
}

// Create a postgres database instance on Cloud SQL
const databaseInstance = new gcp.sql.DatabaseInstance(`${appName}-database-instance`, databaseConfig);

// Create a database on the instance
const database = new gcp.sql.Database(`${appName}-database`, {
    project: projectName,
    instance: databaseInstance.name,
    name: appName,
});

// Define a user to connect to the database
const users = new gcp.sql.User("notejam", {
    project: projectName,
    name: dbUser,
    instance: databaseInstance.name,
    password: dbPass,
});

// Create a managed CloudRun service to run the server container
const service = new gcp.cloudrun.Service(appName, {
    location: locationName,
    project: projectName,
    metadata: {
        namespace: projectName,
    },
    spec: {
        containers: [
            {
                image: imageName,
                envs: [
                    {
                        name: '_NOTEJAM_ENVIRONMENT',
                        value: stageName,
                    },
                    {
                        name: '_NOTEJAM_DB_CONN',
                        value: databaseInstance.connectionName,
                    },
                    {
                        name: '_NOTEJAM_DB_USER',
                        value: dbUser,
                    },
                    {
                        name: '_NOTEJAM_DB_PASS',
                        value: dbPass,
                    },
                    {
                        name: '_NOTEJAM_DB_NAME',
                        value: appName,
                    },
                ],
            },
        ],
    },
});

// Create a CloudBuild CI/CD trigger
const pipeline = new gcp.cloudbuild.Trigger(appName, {
    project: projectName,
    github: {
        name: repositoryName,
        owner: repositoryOwner,
        push: {
            branch: branchName,
        }
    },
    description: `notejam build pipeline for stage '${stageName}'`,
    substitutions: {
        '_APP': appName,
        '_SERVICE': service.name,
        '_SQL_CONN': databaseInstance.connectionName,
    },
    filename: 'ci/cloudbuild.yaml'
});

// Authorize CloudBuild SA to deploy to CloudRun
const pipelineBinding = new gcp.projects.IAMBinding(`${appName}-pipeline`, {
    role: 'roles/editor',
    project: projectName,
    members: [
        `serviceAccount:${projectNumber}@cloudbuild.gserviceaccount.com`,
    ],
});

// Authorize GCE SA (used by Cloud Run) to access SQL db
const serviceBinding = new gcp.projects.IAMBinding(`${appName}-service`, {
    role: 'roles/cloudsql.client',
    project: projectName,
    members: [
        `serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`,
    ],
});
