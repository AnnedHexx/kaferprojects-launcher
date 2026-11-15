const steps = Array.from(document.querySelectorAll('.step'))
const dots = Array.from(document.querySelectorAll('.dot'))
const backBtn = document.getElementById('back')
const cancelBtn = document.getElementById('cancel')
const nextBtn = document.getElementById('next')
const runBtn = document.getElementById('run')
const closeBtn = document.getElementById('close')

const pathInput = document.getElementById('install-path')
const defaultPathLabel = document.getElementById('default-path')
const browseBtn = document.getElementById('browse')
const pathError = document.getElementById('path-error')

const progressFile = document.getElementById('progress-file')
const progressPercent = document.getElementById('progress-percent')
const progressFill = document.getElementById('progress-fill')
const progressBar = document.getElementById('progress-bar')
const progressCount = document.getElementById('progress-count')
const installError = document.getElementById('install-error')

const installedPath = document.getElementById('installed-path')
const shortcutCheck = document.getElementById('opt-shortcut')
const startupCheck = document.getElementById('opt-startup')
const finishError = document.getElementById('finish-error')

let current = 1
let installing = false
let defaultPath = ''

function showStep(step) {
  current = step
  steps.forEach((element) => element.classList.toggle('active', Number(element.dataset.step) === step))
  dots.forEach((dot, index) => {
    dot.classList.toggle('done', index + 1 < step)
    dot.classList.toggle('current', index + 1 === step)
  })
  backBtn.hidden = step !== 2
  cancelBtn.hidden = step === 3 || step === 4
  nextBtn.hidden = step === 3 || step === 4
  runBtn.hidden = step !== 4
  closeBtn.hidden = step !== 4
  nextBtn.textContent = 'Siguiente'
  nextBtn.disabled = false
  cancelBtn.disabled = false
}

function showError(element, message) {
  element.textContent = message
  element.hidden = !message
}

async function loadDefaults() {
  defaultPath = await window.ekoInstaller.defaultPath()
  defaultPathLabel.textContent = defaultPath
  if (!pathInput.value) pathInput.value = defaultPath
}

browseBtn.addEventListener('click', async () => {
  const selected = await window.ekoInstaller.chooseFolder(pathInput.value || defaultPath)
  if (selected) {
    pathInput.value = selected
    showError(pathError, '')
  }
})

pathInput.addEventListener('input', () => showError(pathError, ''))

backBtn.addEventListener('click', () => {
  if (installing) return
  showStep(1)
})

cancelBtn.addEventListener('click', () => {
  window.ekoInstaller.cancel()
})

nextBtn.addEventListener('click', () => {
  if (current === 1) {
    showStep(2)
    return
  }

  if (current === 2 || current === 3) {
    const target = pathInput.value.trim()
    if (!target) {
      showError(pathError, 'Escribe o selecciona una carpeta de instalación.')
      showStep(2)
      return
    }
    showError(pathError, '')
    startInstall(target)
  }
})

async function startInstall(target) {
  installing = true
  showStep(3)
  showError(installError, '')
  progressFile.textContent = 'Preparando instalación…'
  progressPercent.textContent = '0%'
  progressFill.style.width = '0%'
  progressBar.setAttribute('aria-valuenow', '0')
  progressCount.textContent = '0 archivos'

  const result = await window.ekoInstaller.install(target)
  installing = false

  if (!result.ok) {
    showError(installError, result.error || 'La instalación falló. Inténtalo de nuevo.')
    cancelBtn.hidden = false
    nextBtn.hidden = false
    nextBtn.textContent = 'Reintentar'
    return
  }

  installedPath.textContent = result.installPath
  showStep(4)
}

window.ekoInstaller.onProgress((progress) => {
  const percent = progress.percent || 0
  progressPercent.textContent = `${percent}%`
  progressFill.style.width = `${percent}%`
  progressBar.setAttribute('aria-valuenow', String(percent))
  progressCount.textContent = `${progress.copied} de ${progress.total} archivos`
  const file = String(progress.file || '').replace(/\\/g, '/')
  progressFile.textContent = file.length > 58 ? `…${file.slice(-57)}` : file
})

async function finish(runNow) {
  runBtn.disabled = true
  closeBtn.disabled = true
  showError(finishError, '')

  const result = await window.ekoInstaller.finish({
    createShortcut: shortcutCheck.checked,
    addToStartup: startupCheck.checked,
    runNow,
  })

  if (!result.ok) {
    showError(finishError, result.error || 'No se pudo completar la operación.')
    runBtn.disabled = false
    closeBtn.disabled = false
    return
  }

  runBtn.disabled = true
  closeBtn.disabled = true
}

runBtn.addEventListener('click', () => finish(true))
closeBtn.addEventListener('click', () => finish(false))

loadDefaults()
showStep(1)
