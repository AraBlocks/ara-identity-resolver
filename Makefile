DOCKER := $(shell which docker)
DOCKER_TAG := arablocks/ann-identity-resolver

docker: Dockerfile
	$(DOCKER) build -t $(DOCKER_TAG) .
