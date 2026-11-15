const fs = require('node:fs')
const path = require('node:path')

function collectFiles(root, skip = new Set()) {
  const files = []
  const walk = (dir, relative) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      const nextRelative = relative ? path.join(relative, entry.name) : entry.name
      if (entry.isDirectory()) walk(full, nextRelative)
      else files.push({ source: full, relative: nextRelative })
    }
  }
  walk(root, '')
  return files
}

function planInstall(root, runtimeRoot) {
  if (runtimeRoot) {
    if (!fs.existsSync(runtimeRoot)) throw new Error(`No se encontró el runtime de la aplicación: ${runtimeRoot}`)
    return collectFiles(runtimeRoot, new Set(['node_modules'])).map((file) => ({
      source: file.source,
      target: file.relative,
    }))
  }

  const groups = [
    { from: path.join(root, 'out'), prefix: 'app', skip: new Set() },
    { from: path.join(root, 'electron'), prefix: 'electron', skip: new Set(['node_modules']) },
  ]

  const plan = []
  for (const group of groups) {
    if (!fs.existsSync(group.from)) throw new Error(`No se encontró el recurso requerido: ${group.from}`)
    for (const file of collectFiles(group.from, group.skip)) {
      plan.push({
        source: file.source,
        target: path.join(group.prefix, file.relative),
      })
    }
  }
  return plan
}

async function installTo({ root, installPath, runtimeRoot = null, onProgress = () => {}, delay = 0 }) {
  const resolved = path.resolve(installPath)
  if (!path.isAbsolute(resolved)) throw new Error('La ruta de instalación no es válida.')
  if (resolved === path.parse(resolved).root) throw new Error('Elige una carpeta de instalación, no la raíz del disco.')
  if (resolved === path.resolve(root)) throw new Error('No puedes instalar sobre la carpeta del proyecto.')

  const plan = planInstall(root, runtimeRoot)

  fs.mkdirSync(resolved, { recursive: true })

  let copied = 0
  for (const file of plan) {
    const destination = path.join(resolved, file.target)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(file.source, destination)
    copied += 1
    onProgress({ percent: Math.round((copied / plan.length) * 100), total: plan.length, copied, file: file.target })
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
  }

  if (!runtimeRoot) {
    const manifest = {
      name: 'kaferprojects-launcher',
      productName: 'KaferProjects Launcher',
      version: '1.0.0',
      private: true,
      main: 'electron/main.js',
    }
    fs.writeFileSync(path.join(resolved, 'package.json'), JSON.stringify(manifest, null, 2))
  }

  return { files: plan.length, installPath: resolved }
}

module.exports = { planInstall, installTo }
