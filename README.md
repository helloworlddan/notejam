# Notejam on Cloud Run and Cloud SQL

This document describes the deployment of [Notejam](https://github.com/komarserjio/notejam) on Google Cloud Run and Cloud SQL. It is using the Notejam's Python/Django implementation.

[![Run on Google Cloud](https://deploy.cloud.run/button.svg)](https://deploy.cloud.run?dir=container)

## Architecture Overview

The original Notejam application follows a monolithic design in which both the stateless webserver and a stateful SQLite database is run on the same machine. In order to enable decoupled development and higher scalability of the application, the stateful relational database has been decoupled from the webserver in this design. The local SQLite database has been replaced by a remote Postgres database managed by Google Cloud SQL.

![Architecture Diagram](/assets/arch.png)

The stateless web server is containerized and deployed on managed Google Cloud Run. The database is launched on Google Cloud SQL. The application source is contiously integrated, containerized and deployed on Google Cloud Build. The application deployment is monitored using integrated Stackdriver tools.

## Environments & Stages

This deployment is completely automated and comes with a set of configuration files (`infra/Pulumi.*.yaml`), which enable you to deploy multiple environments with different configurations. Each environment should be run in it's own Google Cloud Project to ensure isolation of resources. It is advised to operate at least three distinct environments (`dev`, `test`, `prod`). As soon as development team sizes cross a certain threshold, it is recommended to build automation tools to easily create individual temporary development environments. You can achieve this easily by creating additional configurations, based on the three available ones that ship with the repository.

## Scalability & Elasticity

Because of the fact that the redesigned web tier of the application is now stateless, we can leverage scaling it horizontally. The containerized application is running on full-managed Google Cloud Run making it de-facto serverless. Cloud Run will automatically scale the number of running containers in and out based on the number of inbound web requests. This allows for cost-effective scaling: the application will scale in slowly to zero when there is no demand and it will scale out quickly to virtually limitless scale as soon as requests come in.

Due to the inherent nature of relational database technology, it is not a simple task to scale the database horizontally without creating a sharded cluster or a cell-based architecture. The database can be scaled vertically, though.

In high scale scenarios, it is recommended to re-architect the database storage all together. To truly enable this application to scale, the relational database should be replaced by a non-relational database system. An initial suggestion would be Google Cloud Firestore. 

## Security

Access to the Postgres database on Cloud SQL is granted to the application by using a Cloud SQL Proxy sidecar. The sidecar uses the service account of the Cloud Run service to authenticate with IAM and to expose a direct unix socket to the postgres database to be consumed by the running container. Hence, the authentication for the database access is additionally secured by IAM.

The application traffic on the frontend is encrypted and secure by a Google-managed certificate (TLS). All application data is encrypted at rest per default.

The following dependencies SHOULD be upgraded to fix possible vulnerabilities:

- `django`: SHOULD upgrade to `1.11.19`, will break `south` dependency
  - [CVE-2015-5143](https://github.com/advisories/GHSA-h582-2pch-3xv3)
  - [CVE-2019-6975](https://github.com/advisories/GHSA-wh4h-v3f2-r2pp)
  - [CVE-2019-3498](https://github.com/advisories/GHSA-337x-4q8g-prc5)

## Backups & Disaster Recovery

The production database should have automated backups enabled. Automatic snapshots can be enabled on Cloud SQL.

The production environment of the application is designed to withstand zonal outages. The stateless web tier is very resilient to zonal outages as the scheduler will simply replace missing containers. The production database is configured to replicate data mutation to a standby instance in a different zone. Should the master becom unavailable, Cloud SQL will automatically promote the standby to master and redirect traffic. No manual intervention is reqiured. The master will replicate binary logs [synchrounously](https://cloud.google.com/sql/docs/postgres/high-availability) bringing down the Recovery Point Objective to effectively 0 seconds. Failing over to the secondary instance happens very quickly supporting aggressive RTOs of under a minute.

Multi-regional high availability can be achieved by creating a cross-region replica. Additionally, automation needs to be put in place to detect and execute failover procedure in the event of a region failure. The replica has to be promote to master. The Cloud Run service can be duplicated an deployed in to the standby region. Failover can be execute by redirecting DNS records to the service endpoints in the failover region using short TTLs.

## Development & Deployment

Google Cloud Build is used to integrate and deploy the application container on Cloud Run. Each environment comes with a separate Cloud Build definition and is configured to listen on pushes to particular branches. Cloud Build integrates, tests, and deploys the container images to Cloud Run using it's builtin blue-green deployment capability. Failing deployments are automatically rolled back to the last known stable configuration.

The infrastructure of the application (including the CI/CD definitions) is deployed using Pulumi.

## Monitoring & Operations

Both Cloud Run and Cloud SQL automatically publish application and platform telemetry to be consumed by Stackdriver. Custom monitoring dashboard can be build in Stackdriver. Furthermore, the Stackdriver family of products is aware of the Python 2.7 runtime environment of the web server. It will automatically visualize runtime errors and it is able to live debug the deployed application artifact.

## Let me try it!

First, create a `infra/Pulumi.YOUR-ENV-NAME.yaml` to configure your environment and btain credentials for the infrastructure deployment locally to authenticate Pulumi's terraform provider backend to make calls towards the GCP control plane on your behalf.

A source code repository (preferably Github, just like the one your looking at) is required. You will need to authenticate and authorize Google Cloud Build to access the repository.

Install dependencies and execute the deployment like this:
```bash
make STAGE=dev all
```

That should be it. If you need to seed and migrate data, you have to do this manually before Notejam will be able to work with the database. You can use Google Cloud Shell or a temporary administrative GCE instance to complete this task.
