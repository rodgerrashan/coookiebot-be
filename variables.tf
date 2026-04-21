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
