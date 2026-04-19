output "instance_name" {
  description = "Lightsail backend instance name"
  value       = aws_lightsail_instance.backend.name
}

output "instance_public_ip" {
  description = "Public IP for SSH and HTTP access"
  value       = aws_lightsail_instance.backend.public_ip_address
}

output "instance_arn" {
  description = "Lightsail backend instance ARN"
  value       = aws_lightsail_instance.backend.arn
}
