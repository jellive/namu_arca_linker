interface StorageData {
  enabled: boolean;
}

async function loadState(): Promise<StorageData> {
  return new Promise((resolve) => {
    chrome.storage.local.get({ enabled: true }, (local) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "[나무위키 아카링커] loadState(local): 스토리지 읽기 실패 —",
          chrome.runtime.lastError.message,
        );
      }
      resolve({ enabled: local["enabled"] as boolean });
    });
  });
}

function applyToggleUI(enabled: boolean): void {
  const toggle = document.getElementById("toggle") as HTMLInputElement;
  const statusText = document.getElementById("status-text") as HTMLElement;
  const body = document.body;

  toggle.checked = enabled;
  statusText.textContent = enabled ? "활성화됨" : "비활성화됨";
  statusText.className = enabled ? "status-on" : "status-off";
  body.dataset["enabled"] = String(enabled);
}

async function init(): Promise<void> {
  const state = await loadState();

  const toggle = document.getElementById("toggle") as HTMLInputElement;

  applyToggleUI(state.enabled);

  toggle.addEventListener("change", () => {
    const newEnabled = toggle.checked;
    chrome.storage.local.set({ enabled: newEnabled });
    applyToggleUI(newEnabled);
  });
}

document.addEventListener("DOMContentLoaded", init);
