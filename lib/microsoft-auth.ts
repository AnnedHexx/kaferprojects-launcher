'use client'

// Client ID de Azure (Application ID) de KaferProjects Launcher.
export const MICROSOFT_CLIENT_ID = '58dbac06-a954-46b4-991c-57192c82cd32'

const LOGIN_BASE = 'https://login.microsoftonline.com/consumers/oauth2/v2.0'
const SCOPE = 'XboxLive.signin offline_access openid profile'

export const microsoftConfigured = Boolean(MICROSOFT_CLIENT_ID && MICROSOFT_CLIENT_ID.length === 36)

export type DeviceCodeInfo = {
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
  deviceCode: string
  expiresIn: number
  interval: number
  message: string
}

export type MicrosoftProfile = {
  gamertag: string
  email: string
  xuid?: string
  warning?: string
}

type ProxyResponse = { ok: boolean; status: number; data?: unknown; error?: string }

async function proxyRequest(options: {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
}): Promise<ProxyResponse> {
  if (typeof window !== 'undefined' && window.ekoLauncher?.microsoftRequest) {
    return window.ekoLauncher.microsoftRequest(options) as Promise<ProxyResponse>
  }
  try {
    const response = await fetch(options.url, {
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body,
    })
    let data: unknown = await response.text()
    try {
      data = JSON.parse(String(data))
    } catch {}
    return { ok: response.ok, status: response.status, data }
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : 'Error de red' }
  }
}

export async function requestDeviceCode(): Promise<DeviceCodeInfo> {
  const reg = await proxyRequest({
    url: `${LOGIN_BASE}/devicecode`,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: MICROSOFT_CLIENT_ID, scope: SCOPE }).toString(),
  })

  const data = (reg.data || {}) as Record<string, string>
  if (!reg.ok) {
    throw new Error(
      data.error_description ||
        data.error ||
        reg.error ||
        'No se pudo iniciar el flujo de acceso con Microsoft.',
    )
  }

  return {
    userCode: data.user_code,
    verificationUri: data.verification_uri || 'https://www.microsoft.com/link',
    verificationUriComplete: data.verification_uri_complete || undefined,
    deviceCode: data.device_code,
    expiresIn: Number(data.expires_in) || 900,
    interval: Number(data.interval) || 5,
    message: data.message || '',
  }
}

export type PollResult =
  | { status: 'pending' }
  | { status: 'done'; profile: MicrosoftProfile }
  | { status: 'error'; error: string }

export async function pollForToken(info: DeviceCodeInfo): Promise<PollResult> {
  const response = await proxyRequest({
    url: `${LOGIN_BASE}/token`,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: info.deviceCode,
    }).toString(),
  })

  const data = (response.data || {}) as Record<string, string>

  if (data.error === 'authorization_pending' || data.error === 'slow_down') {
    return { status: 'pending' }
  }
  if (data.error === 'authorization_declined') {
    return { status: 'error', error: 'Acceso rechazado por el usuario.' }
  }
  if (data.error === 'expired_token' || data.error === 'code_expired') {
    return { status: 'error', error: 'El código expiró. Inténtalo de nuevo.' }
  }
  if (!response.ok || data.error || !data.access_token) {
    return {
      status: 'error',
      error: data.error_description || data.error || response.error || 'No se pudo completar el acceso con Microsoft.',
    }
  }

  const fromIdToken = decodeIdToken(data.id_token)
  const profile = await resolveProfile(data.access_token, fromIdToken)
  return { status: 'done', profile }
}

export async function resolveXuid(gamertag: string): Promise<string | undefined> {
  if (!gamertag.trim()) return undefined
  const response = await proxyRequest({
    url: `https://api.geysermc.org/v2/xbox/xuid/${encodeURIComponent(gamertag.trim())}`,
  })
  const data = (response.data || {}) as { xuid?: number | string }
  if (!response.ok || !data.xuid) return undefined
  return String(data.xuid)
}

async function resolveProfile(
  accessToken: string,
  hint: { name?: string; email?: string },
): Promise<MicrosoftProfile> {
  const fallbackGamertag = (hint.name || hint.email || 'Jugador').split('@')[0].replace(/\s+/g, '') || 'Jugador'
  const email = hint.email || ''

  try {
    const xbl = await proxyRequest({
      url: 'https://user.auth.xboxlive.com/user/authenticate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-xbl-contract-version': '1' },
      body: JSON.stringify({
        Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${accessToken}` },
        RelyingParty: 'http://auth.xboxlive.com',
        TokenType: 'JWT',
      }),
    })

    const xblData = (xbl.data || {}) as {
      Token?: string
      DisplayClaims?: { xui?: { uhs?: string }[] }
    }
    if (!xbl.ok || !xblData.Token) {
      return {
        gamertag: fallbackGamertag,
        email,
        warning: 'Xbox Live rechazó el token de Microsoft. Revisa que la app permita cuentas personales y el permiso XboxLive.signin.',
      }
    }

    const uhs = xblData.DisplayClaims?.xui?.[0]?.uhs || ''

    const xsts = await proxyRequest({
      url: 'https://xsts.auth.xboxlive.com/xsts/authorize',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-xbl-contract-version': '1' },
      body: JSON.stringify({
        Properties: { SandboxId: 'RETAIL', UserTokens: [xblData.Token] },
        RelyingParty: 'http://xboxlive.com',
        TokenType: 'JWT',
      }),
    })

    const xstsData = (xsts.data || {}) as {
      Token?: string
      DisplayClaims?: { xui?: { uhs?: string; xid?: string }[] }
      XErr?: number
    }
    if (!xsts.ok || !xstsData.Token) {
      return {
        gamertag: fallbackGamertag,
        email,
        warning: xboxErrorMessage(xstsData.XErr),
      }
    }

    const xuid = xstsData.DisplayClaims?.xui?.[0]?.xid || ''
    const authorization = `XBL3.0 x=${uhs};${xstsData.Token}`

    let gamertag = fallbackGamertag
    try {
      const profile = await proxyRequest({
        url: `https://profile.xboxlive.com/users/xuid(${xuid})/profile/settings?settings=Gamertag`,
        headers: {
          Authorization: authorization,
          'x-xbl-contract-version': '2',
          Accept: 'application/json',
        },
      })
      const profileData = (profile.data || {}) as {
        profileUsers?: { settings?: { id?: string; value?: string }[] }[]
      }
      const found = profileData.profileUsers?.[0]?.settings?.find((setting) => setting.id === 'Gamertag')
      if (found?.value) gamertag = found.value
    } catch {}

    return { gamertag, email, xuid }
  } catch {
    return { gamertag: fallbackGamertag, email, warning: 'No se pudo conectar con Xbox Live.' }
  }
}

function xboxErrorMessage(code?: number) {
  switch (code) {
    case 2148916233:
      return 'Esta cuenta de Microsoft no tiene un perfil de Xbox. Crea uno en xbox.com e inténtalo de nuevo.'
    case 2148916235:
      return 'Xbox Live no está disponible en el país de esta cuenta.'
    case 2148916236:
    case 2148916237:
      return 'La cuenta necesita verificación de adulto en xbox.com.'
    case 2148916238:
      return 'Esta cuenta es de un menor y debe añadirse a una familia de Microsoft.'
    default:
      return 'Xbox Live no pudo autorizar la cuenta. Puede que no tenga un perfil de Xbox.'
  }
}

function decodeIdToken(token?: string): { name?: string; email?: string } {
  if (!token) return {}
  try {
    const payload = token.split('.')[1]
    const json = JSON.parse(
      decodeURIComponent(
        atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((c) => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
          .join(''),
      ),
    )
    return {
      name: json.name || json.preferred_username || '',
      email: json.email || json.preferred_username || '',
    }
  } catch {
    return {}
  }
}
