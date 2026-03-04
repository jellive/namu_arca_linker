interface TargetSite {
  name: string
  url: string
}

const DEFAULT_TARGET_SITES: TargetSite[] = [
  {
    name: '아카라이브 (나무위키 핫나우)',
    url: 'https://arca.live/b/namuhotnow?target=all&keyword={keyword}'
  }
]

async function loadSites(): Promise<TargetSite[]> {
  return new Promise(resolve => {
    chrome.storage.sync.get({ targetSites: DEFAULT_TARGET_SITES }, data => {
      resolve(data['targetSites'] as TargetSite[])
    })
  })
}

async function saveSites(sites: TargetSite[]): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.sync.set({ targetSites: sites }, resolve)
  })
}

function createSiteRow(site: TargetSite, index: number): HTMLElement {
  const row = document.createElement('div')
  row.className = 'site-row'
  row.dataset['index'] = String(index)

  const info = document.createElement('div')
  info.className = 'site-info'

  const nameInput = document.createElement('input')
  nameInput.className = 'site-name'
  nameInput.type = 'text'
  nameInput.value = site.name
  nameInput.placeholder = '사이트 이름'

  const urlInput = document.createElement('input')
  urlInput.className = 'site-url'
  urlInput.type = 'text'
  urlInput.value = site.url
  urlInput.placeholder = 'URL ({keyword} 위치에 검색어가 삽입됩니다)'

  info.appendChild(nameInput)
  info.appendChild(urlInput)

  const removeBtn = document.createElement('button')
  removeBtn.className = 'remove-btn'
  removeBtn.dataset['index'] = String(index)
  removeBtn.setAttribute('aria-label', '삭제')
  removeBtn.textContent = '✕'

  row.appendChild(info)
  row.appendChild(removeBtn)

  return row
}

function renderSites(sites: TargetSite[]): void {
  const list = document.getElementById('sites-list') as HTMLElement
  list.textContent = ''

  sites.forEach((site, index) => {
    list.appendChild(createSiteRow(site, index))
  })
}

function collectSites(): TargetSite[] {
  const rows = document.querySelectorAll<HTMLElement>('.site-row')
  const sites: TargetSite[] = []

  rows.forEach(row => {
    const name = (row.querySelector('.site-name') as HTMLInputElement).value.trim()
    const url = (row.querySelector('.site-url') as HTMLInputElement).value.trim()
    if (name && url) {
      sites.push({ name, url })
    }
  })

  return sites
}

function showStatus(message: string, isError = false): void {
  const status = document.getElementById('status') as HTMLElement
  status.textContent = message
  status.className = isError ? 'status error' : 'status success'
  status.style.display = 'block'
  setTimeout(() => {
    status.style.display = 'none'
  }, 2000)
}

async function init(): Promise<void> {
  const sites = await loadSites()
  renderSites(sites)

  const list = document.getElementById('sites-list') as HTMLElement
  const addBtn = document.getElementById('add-btn') as HTMLButtonElement
  const saveBtn = document.getElementById('save-btn') as HTMLButtonElement
  const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement

  list.addEventListener('click', e => {
    const target = e.target as HTMLElement
    if (target.classList.contains('remove-btn')) {
      const index = Number(target.dataset['index'])
      const current = collectSites()
      current.splice(index, 1)
      renderSites(current)
    }
  })

  addBtn.addEventListener('click', () => {
    const current = collectSites()
    current.push({ name: '', url: '' })
    renderSites(current)
    const rows = list.querySelectorAll('.site-row')
    const lastRow = rows[rows.length - 1]
    ;(lastRow?.querySelector('.site-name') as HTMLInputElement)?.focus()
  })

  saveBtn.addEventListener('click', async () => {
    const current = collectSites()
    if (current.length === 0) {
      showStatus('최소 하나의 사이트가 필요합니다.', true)
      return
    }
    await saveSites(current)
    showStatus('저장되었습니다.')
  })

  resetBtn.addEventListener('click', async () => {
    await saveSites(DEFAULT_TARGET_SITES)
    renderSites(DEFAULT_TARGET_SITES)
    showStatus('기본값으로 초기화되었습니다.')
  })
}

document.addEventListener('DOMContentLoaded', init)
