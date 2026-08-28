#!/bin/sh
set -eu

config_path=/etc/cloudflared/config.yml
expected_tunnel=c0bb9df6-151f-4108-a4bd-2bf43e1cd400
tasker_hostname=tasker.dpkomis.pl
tasker_origin=http://127.0.0.1:8090

if [ "$(id -u)" -ne 0 ]; then
  echo "Uruchom ten skrypt przez sudo." >&2
  exit 1
fi

if [ ! -f "$config_path" ]; then
  echo "Brak konfiguracji $config_path." >&2
  exit 1
fi

if ! grep -Fq "tunnel: $expected_tunnel" "$config_path"; then
  echo "Identyfikator tunelu nie zgadza się z audytem. Przerywam bez zmian." >&2
  exit 1
fi

if ! curl -fsS "$tasker_origin/api/health/ready" >/dev/null; then
  echo "Tasker nie odpowiada poprawnie na lokalnym porcie 8090." >&2
  exit 1
fi

if ! grep -Fq "hostname: $tasker_hostname" "$config_path"; then
  marker_count=$(grep -Fc "  - service: http_status:404" "$config_path" || true)
  if [ "$marker_count" -ne 1 ]; then
    echo "Nie znaleziono jednoznacznej końcowej reguły 404. Przerywam bez zmian." >&2
    exit 1
  fi

  timestamp=$(date -u +%Y%m%dT%H%M%SZ)
  backup_path="${config_path}.before-tasker.${timestamp}"
  temporary_path=$(mktemp /etc/cloudflared/config.yml.tasker.XXXXXX)
  trap 'rm -f -- "$temporary_path"' EXIT HUP INT TERM

  cp -p -- "$config_path" "$backup_path"
  awk -v hostname="$tasker_hostname" -v origin="$tasker_origin" '
    $0 == "  - service: http_status:404" {
      print "  - hostname: " hostname
      print "    service: " origin
    }
    { print }
  ' "$config_path" > "$temporary_path"
  chmod 0644 "$temporary_path"
  chown root:root "$temporary_path"

  cloudflared --config "$temporary_path" tunnel ingress validate
  install -o root -g root -m 0644 "$temporary_path" "$config_path"
  echo "Dodano regułę $tasker_hostname. Kopia: $backup_path"
else
  echo "Reguła $tasker_hostname jest już obecna."
fi

systemctl restart cloudflared
systemctl is-active --quiet cloudflared
echo "Cloudflare Tunnel działa po restarcie."
