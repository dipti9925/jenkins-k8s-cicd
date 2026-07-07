pipeline {
    agent any

    environment {
        IMAGE_NAME = "cicd-demo-app"
        IMAGE_TAG = "${env.BUILD_NUMBER}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build Docker Image') {
            steps {
                sh 'docker build --no-cache -t $IMAGE_NAME:$IMAGE_TAG .'
                sh 'docker tag $IMAGE_NAME:$IMAGE_TAG $IMAGE_NAME:latest'
            }
        }

        stage('Load Image into Minikube') {
            steps {
                sh 'docker save $IMAGE_NAME:latest -o /tmp/$IMAGE_NAME.tar'
                sh 'docker cp /tmp/$IMAGE_NAME.tar minikube:/tmp/$IMAGE_NAME.tar'
                sh 'docker exec minikube docker load -i /tmp/$IMAGE_NAME.tar'
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                sh 'kubectl apply -f k8s/deployment.yaml'
                sh 'kubectl apply -f k8s/service.yaml'
                sh 'kubectl rollout restart deployment/cicd-demo-app'
                sh 'kubectl rollout status deployment/cicd-demo-app'
            }
        }
    }

    post {
        success {
            echo 'Deployment successful!'
        }
        failure {
            echo 'Pipeline failed.'
        }
    }
}
