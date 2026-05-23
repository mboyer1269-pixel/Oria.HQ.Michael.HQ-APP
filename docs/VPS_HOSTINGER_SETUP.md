# VPS Hostinger Setup — SOVRA Runtime Substrate

**Statut:** Runbook docs-only. Aucun secret réel inclus. À exécuter par Michael (L0) ou agent build après ratification.

**Cible VPS:** Hostinger KVM 4 (4 vCPU, 16 GB RAM, 200 GB NVMe, 16 TB bandwidth, Ubuntu 24.04 LTS, IP `2.24.118.156`)

**Lié à:**
- `docs/AGENTIC_HOLDING_COMPANY_OPERATING_MODEL.md` (doctrine SOVRA)
- `docs/OPERATIONAL_SAFEGUARDS_V1.md` (garde-fous opérationnels)
- `docs/HQ_SIGNAL_WIRING.md` (captation webhook GitHub + crons)

---

## 1. Inventaire actuel (constaté 22 mai 2026)

| Ressource | Valeur | Note |
|-----------|--------|------|
| Plan | KVM 4 | Premium |
| OS | Ubuntu 24.04 LTS | Support jusqu'en 2029 |
| CPU usage | 0% | Idle |
| RAM usage | 4% (~650 MB / 16 GB) | 15.3 GB libres |
| Disk | 12 GB / 200 GB | 188 GB libres |
| Bandwidth | 0.003 TB / 16 TB | Vierge |
| Docker Manager | Disponible (Hostinger natif) | Pas besoin install Docker |
| Backups | 0 configurés | **À FAIRE** |
| Firewall rules | 0 | **À FAIRE** |
| Malware scanner | Not installed | Optionnel |
| SSH | root@2.24.118.156, password actif | **À DURCIR** (key-only) |

---

## 2. Architecture cible sur ce VPS

```
                  Internet
                     │
            ┌────────▼────────┐
            │  Cloudflare DNS │  (ops.suivia.com ou hq.<domain>)
            └────────┬────────┘
                     │
                ┌────▼─────┐
                │  Caddy   │  TLS auto Let's Encrypt + reverse proxy
                └────┬─────┘
        ┌────────────┼─────────────┐
        │            │             │
   ┌────▼────┐  ┌────▼─────┐  ┌────▼──────┐
   │  n8n    │  │ Langfuse │  │ Mem0      │
   │ :5678   │  │ :3001    │  │ :8001     │
   └────┬────┘  └────┬─────┘  └────┬──────┘
        │            │             │
        └────────────┴─────────────┘
                     │
              ┌──────▼──────┐
              │  Postgres   │  (Langfuse local + queue n8n)
              │  :5432      │
              └─────────────┘

         (Supabase cloud séparé pour les tables SOVRA métier)
```

### Allocation RAM prévisionnelle

| Service | RAM cible | Justification |
|---------|-----------|---------------|
| n8n + worker | 800 MB | Workflows SOVRA + queue Redis |
| Langfuse (web + worker) | 1.5 GB | Observability LLM, traces, scoring |
| Postgres local | 1 GB | Langfuse + n8n queue (pas SOVRA métier) |
| Redis | 200 MB | Queue n8n + cache |
| Caddy | 50 MB | Reverse proxy + TLS |
| Mem0 self-host (optionnel) | 500 MB | Mémoire agents |
| OS Ubuntu + overhead | 1.5 GB | Système |
| **Total alloué** | **~5.5 GB / 16 GB** | **10.5 GB headroom** |

Si SOVRA croît : Trigger.dev self-host (~1.5 GB) + Qdrant (~1 GB) restent compatibles avec ce VPS.

---

## 3. Hardening sécurité (priorité 1, avant tout déploiement)

### 3.1 SSH key-only (bannir password)

Sur ta machine locale (Mac/Linux), génère ou récupère ta clé publique :

```bash
# Si pas déjà fait
ssh-keygen -t ed25519 -C "michael@sovra"

# Copier la clé publique sur le VPS
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@2.24.118.156
```

Sur le VPS, durcir `sshd_config` :

```bash
ssh root@2.24.118.156
nano /etc/ssh/sshd_config
```

Modifier :
```
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
```

Recharger :
```bash
systemctl reload sshd
```

**Test:** ouvrir une 2e session SSH avant de fermer la 1re. Si la 2e échoue, restaurer `PasswordAuthentication yes` via la console Hostinger.

### 3.2 Créer un utilisateur non-root

```bash
adduser sovra
usermod -aG sudo sovra
mkdir -p /home/sovra/.ssh
cp /root/.ssh/authorized_keys /home/sovra/.ssh/
chown -R sovra:sovra /home/sovra/.ssh
chmod 700 /home/sovra/.ssh
chmod 600 /home/sovra/.ssh/authorized_keys
```

À partir d'ici, se connecter en `sovra@2.24.118.156` et utiliser `sudo`.

### 3.3 UFW firewall

```bash
sudo apt update && sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP (Caddy redirect → 443)
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
sudo ufw status verbose
```

**Note:** Configurer également les firewall rules natives Hostinger via le hPanel (cf. section "Firewall rules" de l'overview VPS) en miroir d'UFW pour double protection.

### 3.4 Fail2ban (anti brute-force SSH)

```bash
sudo apt install -y fail2ban
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local
```

Section `[sshd]` :
```
enabled = true
port = ssh
maxretry = 3
bantime = 3600
findtime = 600
```

```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

### 3.5 Mises à jour auto sécurité

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

---

## 4. Backups Hostinger (priorité 1)

### 4.1 Snapshots automatiques

Via hPanel → **Backups & Monitoring** → activer :
- Snapshot quotidien (rétention 7 jours minimum)
- Snapshot hebdomadaire (rétention 4 semaines)

### 4.2 Snapshot manuel avant chaque déploiement majeur

Règle SOVRA: avant tout changement de stack, exécuter snapshot manuel.

### 4.3 Sauvegarde externe Postgres (off-VPS)

Cron quotidien (à câbler) :
```bash
# /etc/cron.daily/sovra-pg-backup
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
docker exec sovra-postgres pg_dumpall -U postgres | gzip > /backups/pg-$TIMESTAMP.sql.gz
# Upload vers Backblaze B2 ou OneDrive via rclone
rclone copy /backups/pg-$TIMESTAMP.sql.gz onedrive:sovra-backups/
# Retention 14 jours local
find /backups -name "pg-*.sql.gz" -mtime +14 -delete
```

OneDrive est déjà connecté côté SOVRA HQ — réutiliser ce canal.

---

## 5. Stack Docker (via Hostinger Docker Manager OU Compose manuel)

### 5.1 Préparer le répertoire de travail

```bash
sudo mkdir -p /opt/sovra
sudo chown sovra:sovra /opt/sovra
cd /opt/sovra
mkdir -p {caddy,n8n,langfuse,postgres,backups}
```

### 5.2 `docker-compose.yml` minimal (référence)

```yaml
version: "3.9"

networks:
  sovra-net:
    driver: bridge

volumes:
  caddy_data:
  caddy_config:
  n8n_data:
  langfuse_data:
  postgres_data:
  redis_data:

services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks: [sovra-net]

  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: sovra
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks: [sovra-net]

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data
    networks: [sovra-net]

  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    environment:
      N8N_HOST: ${N8N_HOST}
      N8N_PROTOCOL: https
      WEBHOOK_URL: https://${N8N_HOST}/
      N8N_EDITOR_BASE_URL: https://${N8N_HOST}/
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: ${POSTGRES_USER}
      DB_POSTGRESDB_PASSWORD: ${POSTGRES_PASSWORD}
      EXECUTIONS_MODE: queue
      QUEUE_BULL_REDIS_HOST: redis
      N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}
      GENERIC_TIMEZONE: America/Toronto
      TZ: America/Toronto
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on: [postgres, redis]
    networks: [sovra-net]

  langfuse:
    image: langfuse/langfuse:latest
    restart: unless-stopped
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/langfuse
      NEXTAUTH_URL: https://${LANGFUSE_HOST}
      NEXTAUTH_SECRET: ${LANGFUSE_NEXTAUTH_SECRET}
      SALT: ${LANGFUSE_SALT}
      ENCRYPTION_KEY: ${LANGFUSE_ENCRYPTION_KEY}
      TELEMETRY_ENABLED: "false"
    depends_on: [postgres]
    networks: [sovra-net]
```

### 5.3 `Caddyfile`

```caddy
{
    email michael@sovra.example
}

{$N8N_HOST} {
    reverse_proxy n8n:5678
    encode gzip
    log {
        output file /data/access-n8n.log
    }
}

{$LANGFUSE_HOST} {
    reverse_proxy langfuse:3000
    encode gzip
    log {
        output file /data/access-langfuse.log
    }
}
```

### 5.4 `.env` (template — secrets à générer)

```bash
# Générer les secrets
openssl rand -hex 32  # POSTGRES_PASSWORD
openssl rand -hex 32  # N8N_ENCRYPTION_KEY
openssl rand -hex 32  # LANGFUSE_NEXTAUTH_SECRET
openssl rand -hex 16  # LANGFUSE_SALT
openssl rand -hex 32  # LANGFUSE_ENCRYPTION_KEY
```

Fichier `/opt/sovra/.env` :
```
POSTGRES_USER=sovra
POSTGRES_PASSWORD=<générer>
N8N_HOST=n8n.sovra.example
LANGFUSE_HOST=lf.sovra.example
N8N_ENCRYPTION_KEY=<générer>
LANGFUSE_NEXTAUTH_SECRET=<générer>
LANGFUSE_SALT=<générer>
LANGFUSE_ENCRYPTION_KEY=<générer>
```

Permissions strictes :
```bash
chmod 600 /opt/sovra/.env
```

### 5.5 Démarrer la stack

```bash
cd /opt/sovra
docker compose up -d
docker compose ps
docker compose logs -f caddy
```

---

## 6. DNS (Cloudflare ou autre)

Pointer 2 sous-domaines vers `2.24.118.156` :

| Hostname | Type | Valeur | Proxy |
|----------|------|--------|-------|
| `n8n.<domain>` | A | 2.24.118.156 | DNS only (gris) |
| `lf.<domain>` | A | 2.24.118.156 | DNS only (gris) |

**Pourquoi DNS only et pas proxy orange:** Caddy gère le TLS Let's Encrypt directement. Si Cloudflare proxy = orange, conflit potentiel sur cert challenge HTTP-01. Mettre orange seulement après config Cloudflare Origin Cert.

---

## 7. Validation post-déploiement

Checklist à passer avant d'utiliser le VPS pour SOVRA :

- [ ] SSH key-only fonctionne, password désactivé
- [ ] UFW actif, seuls 22/80/443 ouverts
- [ ] Fail2ban actif et bannit après 3 essais
- [ ] Backups Hostinger snapshots quotidiens configurés
- [ ] Backup Postgres externe (OneDrive) fonctionne (test manuel)
- [ ] Docker Compose stack up: caddy, postgres, redis, n8n, langfuse
- [ ] `https://n8n.<domain>` répond 200, TLS valide, n8n login screen
- [ ] `https://lf.<domain>` répond 200, TLS valide, Langfuse login
- [ ] Cron `pg-backup` programmé
- [ ] Compte admin n8n créé (mot de passe long, stocké dans 1Password)
- [ ] Compte admin Langfuse créé, project "SOVRA" créé, clés API obtenues
- [ ] Test n8n: workflow hello-world ping → Telegram → réception OK
- [ ] Test Langfuse: trace de test reçue depuis n8n via SDK

---

## 8. Coûts (récap)

| Ligne | Montant mensuel | Note |
|-------|-----------------|------|
| VPS Hostinger KVM 4 | déjà payé | Coût marginal SOVRA = $0 |
| Domaine (sovra.example) | ~$1.25 | Pro-rata, déjà possédé probablement |
| Cloudflare DNS | $0 | Free tier |
| Backups Hostinger | inclus plan | OK |
| OneDrive backup storage | déjà payé | Coût marginal SOVRA = $0 |
| **Total infra mensuelle SOVRA** | **~$0–1.25** | |

Vs Hetzner CX22 + Supabase Pro = ~$31/mo. **Économie nette: ~$30/mo** sur l'infra.

---

## 9. Risques résiduels

| Risque | Mitigation |
|--------|------------|
| Hostinger downtime (single VPS) | Snapshot quotidien + plan failover documenté (revenir Hetzner si Hostinger SLA <99%) |
| Disk fill (logs n8n + Langfuse traces) | Logrotate + Langfuse retention 90 jours + monitoring `df -h` via Hostinger |
| Compromise SSH | Key-only + fail2ban + audit log mensuel `last -a` |
| OOM si stack croît | Monitoring RAM Hostinger + alerte si >80% + budget pour upgrade KVM 6 disponible |
| Hostinger Docker Manager bugs | Préférer `docker compose` CLI direct, Docker Manager = UI optionnelle |

---

## 10. Prochaines actions (séquence)

1. **Snapshot Hostinger manuel** (avant tout changement)
2. **Hardening SSH + UFW + fail2ban** (sections 3.1–3.4)
3. **Activer backups Hostinger automatiques** (section 4.1)
4. **Choisir 2 sous-domaines + configurer DNS** (section 6)
5. **Déployer la stack Docker Compose** (section 5)
6. **Valider checklist section 7**
7. **Créer projet Langfuse "SOVRA" + clés API** → à câbler dans les wrappers LLM SOVRA
8. **Première workflow n8n: Telegram approval bot** (gate GF7 de `OPERATIONAL_SAFEGUARDS_V1.md`)

Estimation effort total: **3-5 heures** pour Michael ou agent build accompagné.

---

**Statut docs:** Runbook docs-only. Aucun secret réel inclus. Aucune commande exécutée sur le VPS dans ce PR.
