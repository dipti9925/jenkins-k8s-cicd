# Jenkins + Docker + Kubernetes CI/CD Pipeline

A fully automated CI/CD pipeline that builds a Node.js application, containerizes it with Docker, and deploys it to a local Kubernetes cluster — triggered automatically on every git push.

**Live demo (local):** Runs on Minikube, accessible via a minikube service tunnel.

---

## Architecture
Developer pushes code to GitHub
|
v
Jenkins polls GitHub (every 1 min)
|
v
[ Stage: Checkout ]        Pulls latest code from GitHub
|
v
[ Stage: Build Image ]     docker build -> tags image with build number + :latest
|
v
[ Stage: Load into K8s ]   Pipes image directly into Minikube's Docker runtime
|
v
[ Stage: Deploy to K8s ]   kubectl apply + rollout restart + rollout status
|
v
App live on Kubernetes
(2 replicas, NodePort service)

**Why Jenkins runs in Docker, and Docker builds run inside Jenkins:** Jenkins itself runs as a container, but it's given access to the host's Docker socket, so it can build and manage images as if running natively. This is a common local-dev pattern that avoids installing Jenkins directly on the OS.

**Why the image is piped directly (docker save | docker exec -i minikube docker load) instead of using minikube image load:** During development, minikube image load proved unreliable when invoked from inside the Jenkins container — it would report success but silently fail to transfer the image (see Troubleshooting Log below). Piping the image directly into Minikube's internal Docker daemon avoids the SSH-based transfer mechanism entirely and has proven 100% reliable.

---

## Tech Stack

| Component | Tool |
|---|---|
| CI/CD orchestration | Jenkins (Pipeline as Code — Jenkinsfile) |
| Containerization | Docker |
| Container orchestration | Kubernetes (Minikube, local) |
| Source control | Git + GitHub |
| App runtime | Node.js |
| OS / environment | Ubuntu 22.04 (WSL2 on Windows 11) |

---

## Project Structure
jenkins-k8s-cicd/
├── app/
│   ├── index.js         # Simple Node.js HTTP server
│   └── package.json
├── k8s/
│   ├── deployment.yaml   # 2-replica Kubernetes Deployment
│   └── service.yaml      # NodePort Service to expose the app
├── Dockerfile
├── Jenkinsfile            # Full pipeline definition
└── README.md

---

## Setup Instructions

### Prerequisites
- Windows 11 with WSL2 + Ubuntu 22.04
- Docker Desktop (with WSL2 integration enabled)
- A GitHub account

### 1. Install core tools (inside Ubuntu/WSL2 terminal)

curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube

### 2. Start the Kubernetes cluster

minikube start --driver=docker

### 3. Run Jenkins as a container

docker volume create jenkins_home
docker run -d --name jenkins \
  -p 8080:8080 -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v $(which docker):/usr/bin/docker \
  --group-add $(getent group docker | cut -d: -f3) \
  jenkins/jenkins:lts

### 4. Connect Jenkins to the cluster

docker cp ~/.kube/config jenkins:/var/jenkins_home/.kube/config
docker exec -u root jenkins sed -i "s|$HOME|/var/jenkins_home|g" /var/jenkins_home/.kube/config
docker network connect minikube jenkins
docker exec -u root jenkins sh -c "sed -i 's|https://127.0.0.1:[0-9]*|https://$(minikube ip):8443|' /var/jenkins_home/.kube/config"

### 5. Create the Jenkins Pipeline job
- New Item -> Pipeline -> Name: jenkins-k8s-cicd
- Pipeline -> Definition: Pipeline script from SCM
- SCM: Git -> Repository URL: this repo's URL
- Branch: */main, Script Path: Jenkinsfile
- Build Triggers -> check Poll SCM -> schedule: * * * * *

### 6. Push a change and watch it deploy automatically

git add .
git commit -m "your change"
git push

Within a minute, Jenkins picks it up, builds, and deploys — no manual steps needed.

### Accessing the app

minikube service cicd-demo-service --url

Keep this terminal open (it maintains the tunnel), and open the printed URL in a browser.

---

## Troubleshooting Log

Real issues encountered while building this project, and how they were diagnosed and fixed. Kept here intentionally — these were the hardest and most instructive part of the build.

### 1. Jenkins couldn't reach the Kubernetes cluster (connection refused)
**Symptom:** kubectl get nodes from inside the Jenkins container failed with dial tcp 127.0.0.1:XXXXX: connect: connection refused.

**Cause:** Minikube exposes its API server on 127.0.0.1 from the host's perspective — but inside the Jenkins container, 127.0.0.1 refers to Jenkins itself, not the host machine.

**Fix:** Connected the Jenkins container to Minikube's Docker network directly (docker network connect minikube jenkins) and rewrote the kubeconfig to point at Minikube's actual container IP instead of 127.0.0.1.

### 2. Kubeconfig went stale after every Minikube restart
**Symptom:** A previously working setup broke after restarting the PC — same connection-refused errors returned.

**Cause:** Minikube regenerates internal connection details (IP, SSH keys, ports) on every fresh start. The kubeconfig and .minikube files copied into Jenkins were snapshots that went out of date.

**Fix:** Identified this as a recurring pattern and re-ran the copy/patch commands after each restart. (For a production setup, the better fix would be running Jenkins inside the same cluster it deploys to, avoiding credential copying entirely.)

### 3. minikube image load silently failed from inside Jenkins
**Symptom:** The pipeline stage "Load Image into Minikube" reported no errors and the pipeline continued, but the deployed pods kept running the old container image — new code changes never appeared.

**Cause:** minikube image load uses an SSH-based transfer mechanism that depends on absolute host file paths (e.g., /home/username/.minikube/...). Since Jenkins has a different home directory (/var/jenkins_home), the SSH key path was wrong, and the command failed silently rather than raising a visible pipeline error.

**Fix:** Replaced this step with a direct pipe:

docker save $IMAGE_NAME:latest | docker exec -i minikube docker load

This bypasses the SSH-based mechanism entirely and loads the image straight into Minikube's internal Docker daemon — proven reliable across every subsequent build.

### 4. docker cp + separate docker exec had a race condition
**Symptom:** An intermediate fix using docker save -> docker cp (into the minikube container) -> docker exec ... load intermittently failed with "file not found," even though the copy step reported success.

**Cause:** Copying to a temp file and reading it back in a separate command introduced a timing/filesystem-visibility issue between the two docker exec calls.

**Fix:** Switched to piping the saved image directly through standard input in a single command (see fix #3), eliminating the intermediate file entirely.

---

## What This Project Demonstrates

- Writing and maintaining a multi-stage Jenkins pipeline (Pipeline as Code)
- Containerizing an application with Docker
- Deploying and managing workloads on Kubernetes (Deployments, Services, rollouts)
- Debugging real infrastructure/networking issues between containerized tools
- Setting up automated build triggers (Poll SCM)
- Working across Windows/WSL2/Linux/Docker/Kubernetes boundaries

## Possible Future Improvements
- Move to a proper container registry (e.g., Docker Hub, AWS ECR) instead of loading images directly into Minikube
- Add automated tests as a pipeline stage before deployment
- Add Prometheus/Grafana monitoring for the deployed app
- Migrate from Minikube to a cloud-managed Kubernetes cluster (e.g., AWS EKS)
