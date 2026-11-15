# PUBLICAR EL PROYECTO EN GITHUB (repositorio público)
# ------------------------------------------------------------------
# Uso:  .\publicar.ps1  -Token "ghp_TU_TOKEN_AQUI"
#
# El token lo creas en:
#   GitHub → Settings → Developer settings → Personal access tokens
#          → Tokens (classic) → Generate new token → marca el scope "repo"
# ------------------------------------------------------------------

param(
  [Parameter(Mandatory = $true)]
  [string]$Token,
  [string]$RepoName = "kaferprojects-launcher"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "== 1/4 Comprobando el token ==" -ForegroundColor Cyan
$headers = @{ Authorization = "Bearer $Token"; Accept = "application/vnd.github+json" }
$user = Invoke-RestMethod -Uri "https://api.github.com/user" -Headers $headers
Write-Host "   Conectado como: $($user.login)" -ForegroundColor Green

Write-Host "== 2/4 Creando el repositorio público ==" -ForegroundColor Cyan
$body = @{
  name        = $RepoName
  description = "Launcher de Minecraft Bedrock con instancias compartidas en tiempo real"
  private     = $false
  has_issues  = $true
} | ConvertTo-Json

$repoExists = $false
try {
  $existing = Invoke-RestMethod -Uri "https://api.github.com/repos/$($user.login)/$RepoName" -Headers $headers
  $repoExists = $true
  Write-Host "   El repositorio ya existe: $($existing.html_url)" -ForegroundColor Yellow
} catch {
  $created = Invoke-RestMethod -Uri "https://api.github.com/user/repos" -Method Post -Headers $headers -Body $body -ContentType "application/json"
  Write-Host "   Creado: $($created.html_url)" -ForegroundColor Green
}

Write-Host "== 3/4 Configurando el remoto y subiendo ==" -ForegroundColor Cyan
$remoteUrl = "https://$($user.login):$Token@github.com/$($user.login)/$RepoName.git"
git remote remove origin 2>$null
git remote add origin "https://github.com/$($user.login)/$RepoName.git"
git branch -M main
git push -u "https://$($user.login):$Token@github.com/$($user.login)/$RepoName.git" main --force
Write-Host "   Código subido" -ForegroundColor Green

Write-Host "== 4/4 Verificando que no se subió ningún secreto ==" -ForegroundColor Cyan
$tree = Invoke-RestMethod -Uri "https://api.github.com/repos/$($user.login)/$RepoName/git/trees/main?recursive=1" -Headers $headers
$danger = $tree.tree | Where-Object { $_.path -match "\.env\.local|keystore\.properties|\.jks$|\.pfx$" }
if ($danger) {
  Write-Host "   PELIGRO: se subieron archivos sensibles:" -ForegroundColor Red
  $danger | ForEach-Object { Write-Host "     - $($_.path)" -ForegroundColor Red }
} else {
  Write-Host "   OK: ningún secreto en el repositorio" -ForegroundColor Green
}

Write-Host ""
Write-Host "LISTO: https://github.com/$($user.login)/$RepoName" -ForegroundColor Green
Write-Host ""
Write-Host "Siguiente paso (firma gratis con SignPath):" -ForegroundColor Cyan
Write-Host "  1. Cuenta gratis en https://signpath.io (organización + proyecto 'kaferprojects-launcher')"
Write-Host "  2. Copia tu Organization ID en GitHub → Settings → Secrets → Actions"
Write-Host "  3. Añade también KAFER_CONFIG_TOKEN / KAFER_CONFIG_GIST_ID / KAFER_CONFIG_URL"
Write-Host "  4. Crea un tag:  git tag v1.0.2 ; git push origin v1.0.2"
