const DEFAULT_TARGET_SITES = [
  {
    name: '아카라이브 (나무위키 핫나우)',
    url: 'https://arca.live/b/namuhotnow?target=all&keyword={keyword}'
  }
]

interface StorageData {
  enabled: boolean
  keywordCount: number
  targetSites: Array<{ name: string; url: string }>
}

async function loadState(): Promise<StorageData> {
  return new Promise(resolve => {
    chrome.storage.local.get(
      { enabled: true, keywordCount: 0 },
      local => {
        chrome.storage.sync.get(
          { targetSites: DEFAULT_TARGET_SITES },
          sync => {
            resolve({
              enabled: local['enabled'] as boolean,
              keywordCount: local['keywordCount'] as number,
              targetSites: sync['targetSites'] as Array<{ name: string; url: string }>
            })
          }
        )
      }
    )
  })
}

function applyToggleUI(enabled: boolean): void {
  const toggle = document.getElementById('toggle') as HTMLInputElement
  const statusText = document.getElementById('status-text') as HTMLElement
  const body = document.body

  toggle.checked = enabled
  statusText.textContent = enabled ? '활성화됨' : '비활성화됨'
  statusText.className = enabled ? 'status-on' : 'status-off'
  body.dataset['enabled'] = String(enabled)
}

async function init(): Promise<void> {
  const state = await loadState()

  const toggle = document.getElementById('toggle') as HTMLInputElement
  const countEl = document.getElementById('keyword-count') as HTMLElement
  const optionsBtn = document.getElementById('options-btn') as HTMLButtonElement

  applyToggleUI(state.enabled)
  countEl.textContent = String(state.keywordCount)

  toggle.addEventListener('change', () => {
    const newEnabled = toggle.checked
    chrome.storage.local.set({ enabled: newEnabled })
    applyToggleUI(newEnabled)
  })

  optionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage()
  })
}

document.addEventListener('DOMContentLoaded', init)
