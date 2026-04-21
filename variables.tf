variable "aws_region" {
  description = "AWS region used for Lightsail resources"
  type        = string
  default     = "ap-south-1"
}

variable "availability_zone" {
  description = "Availability zone for the Lightsail instance"
  type        = string
  default     = "ap-south-1a"
}

variable "environment" {
  description = "Environment label"
  type        = string
  default     = "production"
}

variable "instance_name" {
  description = "Lightsail instance name"
  type        = string
  default     = "node-backend-server"
}

variable "bundle_id" {
  description = "Lightsail instance size; nano_3_1 is the selected low-cost Ubuntu option"
  type        = string
  default     = "nano_3_1"
}

variable "key_pair_name" {
  description = "Existing Lightsail key pair name"
  type        = string
  default     = "cb"
}

variable "ssh_allowed_cidr" {
  description = "CIDR allowed to access SSH (port 22), for example 203.0.113.10/32"
  type        = string
  default     = "0.0.0.0/0"
}

variable "domain_name" {
  description = "Public domain that points to the Lightsail static IP"
  type        = string
  default     = "api.coookietrade.online"
}

variable "certbot_email" {
  description = "Email address used by Let's Encrypt for certificate notices"
  type        = string
  default     = "rodrasjay@gmail.com"
}

variable "certbot_enabled" {
  description = "Enable automated certificate issuance/retry with certbot"
  type        = bool
  default     = true
}

variable "app_port" {
  description = "Internal Node.js backend listening port"
  type        = number
  default     = 5005
}

variable "app_user" {
  description = "Linux user that runs the backend service"
  type        = string
  default     = "appsvc"
}

variable "app_base_dir" {
  description = "Base directory for app releases/current symlink"
  type        = string
  default     = "/opt/coookiebot-be"
}

variable "node_major" {
  description = "Node.js major version installed on the instance"
  type        = string
  default     = "20"
}
