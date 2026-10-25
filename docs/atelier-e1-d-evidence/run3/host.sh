cd /workspace/oria-atelier-app
export PATH=/home/box/.local/node22/bin:$PATH ATELIER_LOCAL_USER=michael MICHAEL_HQ_OWNER_ID=michael ORIA_HQ_SUBSCRIPTION_RUNTIMES=1 ORIA_HQ_SUBSCRIPTION_RUNTIMES_FILE=/workspace/atelier-evidence/run3/catalog.json PORT=4318
exec node .local-api-host.mjs
