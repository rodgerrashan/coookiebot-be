terraform {
	required_version = ">= 1.6.0"

	required_providers {
		aws = {
			source  = "hashicorp/aws"
			version = "~> 5.0"
		}
	}
}

provider "aws" {
	region = var.aws_region
}

resource "aws_lightsail_instance" "backend" {
	name              = var.instance_name
	availability_zone = var.availability_zone
	blueprint_id      = var.blueprint_id
	bundle_id         = var.bundle_id
	key_pair_name     = var.ssh_key_pair_name

	user_data = <<-EOT
		#!/bin/bash
		set -euxo pipefail

		export DEBIAN_FRONTEND=noninteractive
		apt-get update
		apt-get install -y ca-certificates curl gnupg lsb-release

		install -m 0755 -d /etc/apt/keyrings
		curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
		chmod a+r /etc/apt/keyrings/docker.gpg

		echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" > /etc/apt/sources.list.d/docker.list

		apt-get update
		apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
		usermod -aG docker ubuntu
		systemctl enable docker
		systemctl start docker

		mkdir -p /opt/coookiebot-be
		chown -R ubuntu:ubuntu /opt/coookiebot-be
	EOT

	tags = var.instance_tags
}

resource "aws_lightsail_instance_public_ports" "backend_ports" {
	instance_name = aws_lightsail_instance.backend.name

	port_info {
		protocol  = "tcp"
		from_port = 80
		to_port   = 80
	}

	port_info {
		protocol  = "tcp"
		from_port = 443
		to_port   = 443
	}

	port_info {
		protocol  = "tcp"
		from_port = 22
		to_port   = 22
		cidrs     = var.allowed_ssh_cidrs
	}
}
