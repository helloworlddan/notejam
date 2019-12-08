init:
	npm --prefix infra i

infra:
	cd infra && pulumi stack select ${STAGE}
	cd infra && pulumi up

all: init infra

.PHONY: all init infra
