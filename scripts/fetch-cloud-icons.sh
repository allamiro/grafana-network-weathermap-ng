#!/usr/bin/env bash
# Download the OFFICIAL cloud provider architecture icon packs onto this
# machine (they are not bundled with the plugin for licensing reasons —
# AWS: CC-BY-ND 2.0, Azure/GCP: vendor diagram-use terms; see issue #215).
#
# Usage:
#   ./scripts/fetch-cloud-icons.sh <aws|azure|gcp|all> [dest-dir]
#
# The default destination is dist/icons/<provider>-official/ so a locally
# built plugin serves them at
#   public/plugins/tamirsuliman-weathermap-panel/icons/<provider>-official/...
# Point a node's "Custom icon URL" at any downloaded SVG to use it. You are
# accepting the respective vendor's terms by downloading.
set -euo pipefail

PROVIDER="${1:-all}"
DEST_BASE="${2:-dist/icons}"

fail_hint() {
  echo "  Download failed — the vendor URL may have rotated." >&2
  echo "  Get the current pack manually from: $1" >&2
}

fetch_azure() {
  local dest="$DEST_BASE/azure-official"
  mkdir -p "$dest"
  local url="https://arch-center.azureedge.net/icons/Azure_Public_Service_Icons_V21.zip"
  echo "Azure: fetching official icon pack..."
  if curl -fsSL "$url" -o /tmp/azure-icons.zip; then
    unzip -qo /tmp/azure-icons.zip -d "$dest" && rm -f /tmp/azure-icons.zip
    echo "Azure icons -> $dest"
  else
    fail_hint "https://learn.microsoft.com/azure/architecture/icons/"
  fi
}

fetch_aws() {
  local dest="$DEST_BASE/aws-official"
  mkdir -p "$dest"
  echo "AWS: the Asset Package URL rotates per release."
  fail_hint "https://aws.amazon.com/architecture/icons/"
  echo "  Unzip the Asset Package's SVG folders into $dest"
}

fetch_gcp() {
  local dest="$DEST_BASE/gcp-official"
  mkdir -p "$dest"
  echo "GCP: the icon bundle URL rotates per release."
  fail_hint "https://cloud.google.com/icons"
  echo "  Unzip the downloaded bundle's SVGs into $dest"
}

case "$PROVIDER" in
  azure) fetch_azure ;;
  aws) fetch_aws ;;
  gcp) fetch_gcp ;;
  all) fetch_azure; fetch_aws; fetch_gcp ;;
  *) echo "usage: $0 <aws|azure|gcp|all> [dest-dir]" >&2; exit 1 ;;
esac
