variable "aws_region" {
  description = "AWS region for Lightsail resources"
  type        = string
  default     = "ap-south-1"
}

variable "instance_name" {
  description = "Lightsail instance name"
  type        = string
  default     = "coookiebot-be-prod"
}

variable "availability_zone" {
  description = "Availability zone for the Lightsail instance"
  type        = string
  default     = "ap-south-1a"
}

variable "blueprint_id" {
  description = "Lightsail blueprint OS image"
  type        = string
  default     = "ubuntu_22_04"
}

variable "bundle_id" {
  description = "Lightsail bundle. micro_3_0 is 1 GB RAM / 1 vCPU (low-cost baseline)."
  type        = string
  default     = "micro_3_0"
}

variable "ssh_key_pair_name" {
  description = "Existing Lightsail key pair name to attach to the instance"
  type        = string
}

variable "allowed_ssh_cidrs" {
  description = "CIDRs allowed to SSH to the instance"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "instance_tags" {
  description = "Tags applied to Lightsail resources"
  type        = map(string)
  default = {
    Project = "coookiebot"
    Service = "backend"
    Env     = "prod"
  }
}
