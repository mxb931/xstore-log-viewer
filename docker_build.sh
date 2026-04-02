
docker build --platform=linux/amd64 -t xstore-log-viewer .

docker tag xstore-log-viewer:latest docker.artifactory.sherwin.com/tag-pos/xstore-log-viewer:0

docker push docker.artifactory.sherwin.com/tag-pos/xstore-log-viewer:0

