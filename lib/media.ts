'use client'


export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('La imagen no se pudo abrir.'))
    image.src = src
  })
}

/**
 * Prepara una imagen del dispositivo para guardarla en localStorage:
 * valida el tipo y el tamaño, y reduce las imágenes grandes conservando
 * los GIF animados tal cual.
 */
export async function prepareImage(file: File, maxBytes = 900 * 1024): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('El archivo debe ser una imagen PNG, JPG, WEBP o GIF.')
  }

  const raw = await fileToDataUrl(file)
  if (file.type === 'image/gif') {
    return raw
  }
  if (file.size <= maxBytes) return raw

  const image = await loadImage(raw)
  const maxSide = 1280
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const context = canvas.getContext('2d')
  if (!context) return raw
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  const compressed = canvas.toDataURL('image/jpeg', 0.82)
  return compressed.length > maxBytes ? canvas.toDataURL('image/jpeg', 0.62) : compressed
}

export function readVideoFile(file: File): Promise<string> {
  if (!file.type.startsWith('video/')) {
    return Promise.reject(new Error('El archivo debe ser un vídeo MP4 o WEBM.'))
  }
  return fileToDataUrl(file)
}

export function isVideoSource(value?: string): boolean {
  if (!value) return false
  return value.startsWith('data:video/') || /\.(mp4|webm|ogv|ogg|mov)(\?|#|$)/i.test(value)
}

export function isImageSource(value?: string): boolean {
  if (!value) return false
  return value.startsWith('data:image/') || /\.(png|jpe?g|gif|webp|avif|bmp|svg)(\?|#|$)/i.test(value)
}
