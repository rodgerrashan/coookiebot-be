provider "aws" {
  region = var.aws_region
}

# 1. Create the Lightsail Instance
resource "aws_lightsail_instance" "node_server" {
  name              = var.instance_name
  availability_zone = var.availability_zone
  blueprint_id      = "ubuntu_22_04"
  bundle_id         = var.bundle_id
  key_pair_name     = var.key_pair_name

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "coookiebot"
  }
}

# 2. Assign a Static IP (Crucial for CI/CD)
resource "aws_lightsail_static_ip" "node_static_ip" {
  name = "${var.instance_name}-static-ip"
}

resource "aws_lightsail_static_ip_attachment" "node_ip_attach" {
  static_ip_name = aws_lightsail_static_ip.node_static_ip.name
  instance_name  = aws_lightsail_instance.node_server.name

  depends_on = [
    aws_lightsail_static_ip.node_static_ip,
    aws_lightsail_instance.node_server
  ]
}

# 3. Open Firewall Ports
resource "aws_lightsail_instance_public_ports" "node_ports" {
  instance_name = aws_lightsail_instance.node_server.name

  port_info {
    protocol  = "tcp"
    from_port = 22
    to_port   = 22
    cidrs     = [var.ssh_allowed_cidr]
  }

  port_info {
    protocol  = "tcp"
    from_port = 80
    to_port   = 80
    cidrs     = ["0.0.0.0/0"]
  }

  port_info {
    protocol  = "tcp"
    from_port = 443
    to_port   = 443
    cidrs     = ["0.0.0.0/0"]
  }
}

output "instance_ip" {
  value = aws_lightsail_static_ip.node_static_ip.ip_address
}

output "instance_name" {
  value = aws_lightsail_instance.node_server.name
}
