import { LOG_PREFIX, NAV_DELAY_MS } from './constants/config'
import { addArcaLinks } from './layers/manipulation'
import { observeRealtimeUpdates } from './layers/observer'

interface TargetSite {
  name: string
  url: string
}

function getStorageState(): Promise<{ enabled: boolean; targetSites: TargetSite[] }> {
  return new Promise(resolve => {
    chrome.storage.local.get({ enabled: true }, local => {
      chrome.storage.sync.get({ targetSites: [] }, sync => {
        resolve({
          enabled: local['enabled'] as boolean,
          targetSites: sync['targetSites'] as TargetSite[]
        })
      })
    })
  })
}

async function init(): Promise<void> {
  const { enabled } = await getStorageState()

  if (!enabled) {
    console.log(`${LOG_PREFIX} 비활성화 상태 — 실행 건너뜀`)
    return
  }

  console.log(`${LOG_PREFIX} 익스텐션 시작`)

  await addArcaLinks()
  observeRealtimeUpdates()

  // SPA navigation support
  if ('navigation' in window) {
    const nav = window.navigation as EventTarget
    nav.addEventListener('navigate', () => {
      console.log(`${LOG_PREFIX} 페이지 내비게이션 감지`)
      setTimeout(addArcaLinks, NAV_DELAY_MS)
    })
  }
}

// Re-check enabled state when it changes via popup toggle
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'enabled' in changes) {
    const newEnabled = changes['enabled']?.newValue as boolean
    if (newEnabled) {
      console.log(`${LOG_PREFIX} 활성화됨 — 링크 추가`)
      addArcaLinks()
    } else {
      console.log(`${LOG_PREFIX} 비활성화됨`)
    }
  }
})

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
