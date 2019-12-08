init:
	npm i

pulumi:
    curl -fsSL 'https://get.pulumi.com' | sh

infrastructure:
	pulumi stack select ${STAGE}
	pulumi up -y

all: init infrastructure 

.PHONY: all init infrastructure pulumi
