// Copyright 2016-2021, Pulumi Corporation.  All rights reserved.

import * as gcp from "@pulumi/gcp-native";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { clusterNodeCount, clusterNodeMachineType, clusterPassword, clusterUsername, masterVersion, project, region, zone } from "./config";

const clusterName = "gke-native";
const cluster = new gcp.container.v1.Cluster("cluster", {
    projectsId: project,
    locationsId: region,
    clustersId: clusterName,
    parent: `projects/${project}/locations/${region}`,
    initialClusterVersion: "1.18.16-gke.2100",
    initialNodeCount: 1,
    masterAuth: { username: clusterUsername, password: clusterPassword },
    name: clusterName,
    network: `projects/${project}/global/networks/default`,
    nodeConfig: {
        oauthScopes: [
            "https://www.googleapis.com/auth/devstorage.read_only",
            "https://www.googleapis.com/auth/logging.write",
            "https://www.googleapis.com/auth/monitoring",
            "https://www.googleapis.com/auth/service.management.readonly",
            "https://www.googleapis.com/auth/servicecontrol",
            "https://www.googleapis.com/auth/trace.append",
            "https://www.googleapis.com/auth/compute",
        ],
    },
});

const nodepoolName = "nodepool";
const nodePool = new gcp.container.v1.ClusterNodePool(`primary-node-pool`, {
    clustersId: clusterName,
    initialNodeCount: clusterNodeCount,
    locationsId: cluster.location,
    nodePoolsId: nodepoolName,
    name: nodepoolName,
    projectsId: project,
    config: {
        preemptible: true,
        machineType: clusterNodeMachineType,
        oauthScopes: [
            "https://www.googleapis.com/auth/compute",
            "https://www.googleapis.com/auth/devstorage.read_only",
            "https://www.googleapis.com/auth/logging.write",
            "https://www.googleapis.com/auth/monitoring",
        ],
    },
    version: masterVersion,
    management: {
        autoRepair: true,
    },
}, {
    dependsOn: [cluster],
});

// Manufacture a GKE-style Kubeconfig. Note that this is slightly "different" because of the way GKE requires
// gcloud to be in the picture for cluster authentication (rather than using the client cert/key directly).
export const kubeConfig = pulumi.
    all([ cluster.name, cluster.endpoint, cluster.masterAuth ]).
    apply(([ name, endpoint, auth ]) => {
        const context = `${project}_${zone}_${name}`;
        return `apiVersion: v1
clusters:
- cluster:
    certificate-authority-data: ${auth.clusterCaCertificate}
    server: https://${endpoint}
  name: ${context}
contexts:
- context:
    cluster: ${context}
    user: ${context}
  name: ${context}
current-context: ${context}
kind: Config
preferences: {}
users:
- name: ${context}
  user:
    auth-provider:
      config:
        cmd-args: config config-helper --format=json
        cmd-path: gcloud
        expiry-key: '{.credential.token_expiry}'
        token-key: '{.credential.access_token}'
      name: gcp
`;
    });

// Export a Kubernetes provider instance that uses our cluster from above.
export const provider = new k8s.Provider("gke-k8s", {
    kubeconfig: kubeConfig,
}, {
    dependsOn: [nodePool],
});
