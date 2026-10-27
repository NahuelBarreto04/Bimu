// Resolve the latest release when clicked so the page never hard-codes a version.
const releasePage = 'https://github.com/marianoarias1/Bimu/releases/latest'
const releaseApi = 'https://api.github.com/repos/marianoarias1/Bimu/releases/latest'
for (const button of document.querySelectorAll('[data-download]')) {
  button.addEventListener('click', async event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (button.dataset.loading) return
    button.dataset.loading = 'true'
    const label = button.textContent
    button.textContent = 'Buscando la última versión…'
    try {
      const response = await fetch(releaseApi, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(8000) })
      if (!response.ok) throw new Error('Release unavailable')
      const release = await response.json()
      const match = /^v(\d+\.\d+\.\d+)$/.exec(release.tag_name || '')
      if (!match) throw new Error('Invalid version')
      const expected = `Bimu_${match[1]}_x64-setup.exe`
      const asset = release.assets?.find(item => item.name === expected && item.state === 'uploaded')
      const url = `https://github.com/marianoarias1/Bimu/releases/download/${release.tag_name}/${expected}`
      if (!asset || asset.browser_download_url !== url) throw new Error('Installer unavailable')
      window.location.assign(url)
    } catch {
      // The release page always offers a usable fallback if GitHub's API is unavailable.
      window.location.assign(releasePage)
    } finally {
      button.textContent = label
      delete button.dataset.loading
    }
  })
}
