# VPS Hostinger Hardening - Procedure d'execution

**Cible:** VPS Hostinger KVM 4 - `2.24.118.156` - Ubuntu 24.04 LTS

**Duree estimee:** 45-60 minutes

**Risque:** Faible si les phases sont suivies dans l'ordre. La Phase B coupe l'acces SSH root/password et ne doit etre lancee qu'apres validation d'une session `sovra`.

---

## Pre-conditions

- [ ] Acces hPanel Hostinger disponible.
- [ ] Snapshot manuel cree avant toute commande VPS.
- [ ] Acces SSH root actuel fonctionne, ou Browser terminal hPanel fonctionne.
- [ ] OpenSSH disponible sur la machine locale.
- [ ] La cle privee SSH reste locale; seul le fichier `.pub` est copie sur le VPS.

Ne lis pas, ne copie pas et ne commit jamais de recovery codes, cles privees, `.env`, API keys ou secrets.

---

## Phase 0 - Snapshot Hostinger

Avant toute commande serveur:

1. Va dans hPanel -> VPS -> serveur `2.24.118.156`.
2. Ouvre **Backups & Monitoring** -> **Snapshots & Backups**.
3. Clique **Create Snapshot**.
4. Attends la fin de l'action dans **Latest actions**.
5. Note la date/heure du snapshot.

Hostinger ne garde qu'un snapshot manuel a la fois et un nouveau snapshot remplace l'ancien. Le snapshot est le rollback rapide avant hardening.

---

## Phase 1 - Preparer la cle publique locale

Sur la machine locale:

```bash
# Verifier si une cle ed25519 existe deja
ls -la ~/.ssh/id_ed25519.pub 2>/dev/null

# Si elle n'existe pas, en creer une avec passphrase
ssh-keygen -t ed25519 -C "michael@sovra-vps" -f ~/.ssh/id_ed25519

# Verifier que le fichier public existe
cat ~/.ssh/id_ed25519.pub
```

La sortie doit commencer par `ssh-ed25519`. Ne copie jamais `~/.ssh/id_ed25519` sur le VPS ou dans Git.

---

## Phase 2 - Uploader la cle publique et les scripts

Depuis ce dossier:

```bash
scp ~/.ssh/id_ed25519.pub root@2.24.118.156:/root/michael-vps.pub
scp 01-phase-a-safe.sh 02-phase-b-lock.sh root@2.24.118.156:/root/
```

Le script Phase A lit la cle depuis `/root/michael-vps.pub`. Il n'y a plus de cle SSH a inserer dans un fichier suivi par Git.

---

## Phase 3 - Executer Phase A

Connecte-toi en root:

```bash
ssh root@2.24.118.156
```

Puis sur le VPS:

```bash
chmod +x /root/01-phase-a-safe.sh /root/02-phase-b-lock.sh
bash /root/01-phase-a-safe.sh /root/michael-vps.pub
```

Phase A:

- met a jour les paquets;
- installe `ufw`, `fail2ban`, `unattended-upgrades`, `curl`, `htop`;
- cree l'utilisateur `sovra`;
- ajoute `sovra` au groupe `sudo`;
- demande un mot de passe Unix fort pour `sovra` afin que `sudo` exige un mot de passe;
- supprime/sauvegarde toute ancienne regle `NOPASSWD` pour `sovra`;
- installe la cle publique dans `/home/sovra/.ssh/authorized_keys`;
- active UFW avec `22/tcp` uniquement;
- ecrit la configuration fail2ban dans `/etc/fail2ban/jail.d/sovra-sshd.conf`;
- active fail2ban;
- prepare `/opt/sovra` sans `.env`, secrets, compose ou stack applicative.

**Ne ferme pas la session root apres Phase A.**

---

## Phase 4 - Valider l'acces `sovra`

Garde la session root ouverte. Dans une deuxieme fenetre locale:

```bash
ssh sovra@2.24.118.156
```

Resultats:

| Resultat | Action |
| --- | --- |
| Connexion `sovra` OK | Passer a Phase 5 |
| `Permission denied (publickey)` | Deboguer depuis la session root ouverte |
| `Connection refused` | Verifier UFW et firewall Hostinger depuis hPanel |

Debug depuis la session root:

```bash
cat /home/sovra/.ssh/authorized_keys
ls -la /home/sovra/.ssh/
ufw status verbose
journalctl -u ssh -n 30 --no-pager
fail2ban-client status sshd
```

Ne lance pas Phase B tant que `ssh sovra@2.24.118.156` ne fonctionne pas.

---

## Phase 5 - Lock SSH definitif

Seulement apres validation de la deuxieme session `sovra`, dans la session root encore ouverte:

```bash
bash /root/02-phase-b-lock.sh
```

Tape `LOCK` quand le script le demande.

Phase B:

- sauvegarde `/etc/ssh/sshd_config`;
- ecrit `/etc/ssh/sshd_config.d/00-sovra-hardening.conf`;
- applique `PermitRootLogin no`;
- applique `PasswordAuthentication no`;
- applique `KbdInteractiveAuthentication no`;
- garde `PubkeyAuthentication yes`;
- limite SSH a `AllowUsers sovra`;
- valide `sshd -t` puis les valeurs effectives via `sshd -T`;
- recharge le service SSH en tentant `sshd`, puis `ssh` si necessaire.

---

## Phase 6 - Validation finale

Depuis une troisieme fenetre locale:

```bash
# Doit marcher avec la cle
ssh sovra@2.24.118.156

# Doit echouer: root interdit
ssh root@2.24.118.156

# Doit echouer: password SSH desactive
ssh -o PreferredAuthentications=password root@2.24.118.156
```

Puis, dans la session `sovra`:

```bash
sudo -l
ufw status verbose
fail2ban-client status sshd
sshd -T -C user=sovra,host="$(hostname)",addr=127.0.0.1 | grep -E '^(permitrootlogin|passwordauthentication|kbdinteractiveauthentication|allowusers|maxauthtries|x11forwarding) '
ls -ld /opt/sovra
```

`sudo -l` doit demander le mot de passe `sovra`.

---

## Phase 7 - Backups et firewall Hostinger

Dans hPanel:

1. **Backups & Monitoring** -> verifier que les backups automatiques sont actifs.
2. Garder au minimum les backups weekly. Activer daily si le cout est accepte.
3. **Security** -> **Firewall** -> creer/activer un firewall VPS miroir avec `22/tcp` accepte.
4. Ne pas ouvrir `80/tcp` ou `443/tcp` maintenant. Ces ports seront ouverts pendant le mandat de deploiement Caddy.

---

## Etat final attendu

| Element | Etat final |
| --- | --- |
| SSH `sovra` | OK par cle ed25519 |
| SSH root | Interdit |
| SSH password | Interdit |
| UFW | Actif, inbound `22/tcp` uniquement |
| Firewall Hostinger | Actif, miroir `22/tcp` |
| fail2ban | Actif sur `sshd` via `/etc/fail2ban/jail.d/sovra-sshd.conf`, 3 essais, ban 1h |
| Sudo `sovra` | Mot de passe requis |
| `/opt/sovra` | Cree, owned by `sovra:sovra`, pas de secrets |
| Stack Docker | Non deployee dans ce mandat |

---

## Rollback

### Option A - Browser terminal Hostinger

1. hPanel -> VPS -> **Browser terminal**.
2. Restaurer le backup principal:

```bash
ls /etc/ssh/sshd_config.bak-*
cp /etc/ssh/sshd_config.bak-<derniere-date> /etc/ssh/sshd_config
rm -f /etc/ssh/sshd_config.d/00-sovra-hardening.conf
systemctl reload sshd || systemctl reload ssh
```

### Option B - Restaurer le snapshot

1. hPanel -> Backups & Monitoring -> Snapshots & Backups.
2. Restaurer le snapshot Phase 0.

La restauration remplace l'etat courant du VPS. Telecharge tout fichier a conserver avant de restaurer.

---

## Prochaine phase separee

Une fois le hardening valide, un mandat separe pourra ouvrir `80/443`, configurer DNS, generer les secrets hors Git, puis deployer Caddy + n8n + Langfuse + Postgres + Redis depuis `/opt/sovra`.
