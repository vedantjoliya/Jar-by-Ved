import { setupAuth, syncToCloud, loadFromCloud, uploadCustomGame, getCustomGames, currentUser, getPreferences, savePreferences } from './firebase-auth.js';

let allGames = [];
let allCustomGames = [];
let prefs = { favorites: [], recents: [] };
let activeFilter = 'all'; // 'all', 'favs', 'recents', 'custom'
let searchQuery = '';
let displayedGamesCount = 60;
const PAGE_CHUNK = 60;

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements - Navigation & Views
  const viewPanels = document.querySelectorAll('.view-panel');
  const desktopNavLinks = document.querySelectorAll('.nav-link');
  const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');
  const bottomNavItems = document.querySelectorAll('.bottom-nav-item');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mobileDrawer = document.getElementById('mobileDrawer');
  const closeDrawerBtn = document.getElementById('closeDrawerBtn');
  const brandLogoBtn = document.getElementById('brandLogoBtn');

  // DOM Elements - Auth & User Profile
  const authBtn = document.getElementById('authBtn');
  const userProfile = document.getElementById('userProfile');
  const userAvatar = document.getElementById('userAvatar');
  const userName = document.getElementById('userName');

  // DOM Elements - Games Library
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const resetSearchBtn = document.getElementById('resetSearchBtn');
  const customUpload = document.getElementById('customUpload');
  const uploadStatus = document.getElementById('uploadStatus');
  const filterPills = document.querySelectorAll('.filter-pill');
  const totalGamesBadge = document.getElementById('totalGamesBadge');
  const favCountBadge = document.getElementById('favCountBadge');
  const recentCountBadge = document.getElementById('recentCountBadge');
  const customCountBadge = document.getElementById('customCountBadge');
  const resultsCount = document.getElementById('resultsCount');

  const gamesGrid = document.getElementById('gamesGrid');
  const recentSection = document.getElementById('recentSection');
  const recentGamesGrid = document.getElementById('recentGamesGrid');
  const clearRecentsBtn = document.getElementById('clearRecentsBtn');
  const favSection = document.getElementById('favSection');
  const favGamesGrid = document.getElementById('favGamesGrid');
  const customSection = document.getElementById('customSection');
  const customGamesGrid = document.getElementById('customGamesGrid');
  const noResults = document.getElementById('noResults');
  const loadMoreContainer = document.getElementById('loadMoreContainer');
  const loadMoreBtn = document.getElementById('loadMoreBtn');
  const libraryHeadingTitle = document.getElementById('libraryHeadingTitle');

  // DOM Elements - Player Modal
  const playerModal = document.getElementById('playerModal');
  const modalContent = playerModal.querySelector('.modal-content');
  const modalGameTitle = document.getElementById('modalGameTitle');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const toggleFullscreenBtn = document.getElementById('toggleFullscreenBtn');
  const gameFrame = document.getElementById('gameFrame');

  // DOM Elements - Support Form
  const supportForm = document.getElementById('supportForm');
  const feedbackResult = document.getElementById('feedbackResult');

  // DOM Elements - FAQ Accordions
  const faqItems = document.querySelectorAll('.faq-item');

  // ==========================================
  // 1. Navigation Switching (Games, FAQ, Support, About)
  // ==========================================
  function switchView(targetViewId) {
    viewPanels.forEach(panel => {
      panel.classList.toggle('active', panel.id === targetViewId);
    });

    // Update Desktop Nav Links
    desktopNavLinks.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.target === targetViewId);
    });

    // Update Mobile Drawer Links
    mobileNavLinks.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.target === targetViewId);
    });

    // Update Mobile Bottom Nav Items
    bottomNavItems.forEach(item => {
      item.classList.toggle('active', item.dataset.target === targetViewId);
    });

    // Scroll smoothly to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Close Mobile Drawer if open
    mobileDrawer.classList.remove('open');
  }

  // Bind Desktop Nav Links
  desktopNavLinks.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      switchView(target);
      window.location.hash = target.replace('-view', '');
    });
  });

  // Bind Mobile Nav Links
  mobileNavLinks.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      switchView(target);
      window.location.hash = target.replace('-view', '');
    });
  });

  // Bind Bottom Nav Items
  bottomNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const target = item.dataset.target;
      switchView(target);
      window.location.hash = target.replace('-view', '');
    });
  });

  // Brand Logo Click -> Games view
  brandLogoBtn.addEventListener('click', (e) => {
    e.preventDefault();
    switchView('games-view');
    window.location.hash = 'games';
  });

  // Mobile Drawer Toggle
  if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', () => {
      mobileDrawer.classList.toggle('open');
    });
  }

  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener('click', () => {
      mobileDrawer.classList.remove('open');
    });
  }

  // Handle URL Hash navigation on load
  function checkUrlHash() {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'faq') switchView('faq-view');
    else if (hash === 'support') switchView('support-view');
    else if (hash === 'about') switchView('about-view');
    else switchView('games-view');
  }
  window.addEventListener('hashchange', checkUrlHash);
  checkUrlHash();

  // ==========================================
  // 2. Google Auth & User Profile Binding
  // ==========================================
  setupAuth({
    authBtn,
    profileContainer: userProfile,
    userAvatar,
    userName
  }, async (user) => {
    prefs = await getPreferences();
    if (user) {
      await loadCustomGames();
    } else {
      allCustomGames = [];
    }
    updateBadges();
    renderAll();
  }, async (cloudData) => {
    // Cross-device sync handler: runs automatically when data changes on laptop/mobile
    if (cloudData) {
      if (cloudData.preferences) {
        prefs = cloudData.preferences;
      }
      if (cloudData.customGames) {
        allCustomGames = cloudData.customGames;
      }
      updateBadges();
      renderAll();
    }
  });

  async function loadCustomGames() {
    if (!currentUser) return;
    try {
      allCustomGames = await getCustomGames() || [];
    } catch (e) {
      console.error('Error loading custom games:', e);
    }
  }

  // ==========================================
  // 3. Load Games Catalog
  // ==========================================
  try {
    const res = await fetch('/games.json');
    allGames = await res.json();
  } catch (e) {
    console.error('Failed to load games.json', e);
  }

  // Local preferences fallback if not signed in
  if (!currentUser) {
    prefs = await getPreferences();
  }

  updateBadges();
  renderAll();

  // ==========================================
  // 4. Search and Filters
  // ==========================================
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
    displayedGamesCount = PAGE_CHUNK; // Reset pagination chunk
    renderAll();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.style.display = 'none';
    displayedGamesCount = PAGE_CHUNK;
    renderAll();
    searchInput.focus();
  });

  if (resetSearchBtn) {
    resetSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      clearSearchBtn.style.display = 'none';
      activeFilter = 'all';
      updateFilterPillUI();
      displayedGamesCount = PAGE_CHUNK;
      renderAll();
    });
  }

  // Filter Pills (All, Favorites, Recents, Custom)
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      activeFilter = pill.dataset.filter;
      updateFilterPillUI();
      displayedGamesCount = PAGE_CHUNK;
      renderAll();
    });
  });

  function updateFilterPillUI() {
    filterPills.forEach(p => {
      p.classList.toggle('active', p.dataset.filter === activeFilter);
    });
  }

  function updateBadges() {
    if (totalGamesBadge) totalGamesBadge.textContent = allGames.length;
    if (favCountBadge) favCountBadge.textContent = prefs.favorites.length;
    if (recentCountBadge) recentCountBadge.textContent = prefs.recents.length;
    if (customCountBadge) customCountBadge.textContent = allCustomGames.length;
  }

  // Load More Button (Optimized lazy rendering for smooth performance on 1000+ games)
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      displayedGamesCount += PAGE_CHUNK;
      renderAll();
    });
  }

  // Clear Recents Button
  if (clearRecentsBtn) {
    clearRecentsBtn.addEventListener('click', async () => {
      if (confirm('Clear your recently played history?')) {
        prefs.recents = [];
        await savePreferences(prefs);
        updateBadges();
        renderAll();
      }
    });
  }

  // Custom Game Upload
  customUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.name.endsWith('.jar')) {
        alert('Please select a valid Java .jar archive.');
        return;
      }
      uploadStatus.textContent = `Uploading ${file.name} to cloud storage...`;
      uploadStatus.style.color = '#38bdf8';

      const gameData = await uploadCustomGame(file);
      if (gameData) {
        uploadStatus.textContent = `Successfully uploaded ${file.name}! Added to your library.`;
        uploadStatus.style.color = '#4ade80';
        setTimeout(() => { uploadStatus.textContent = ''; }, 4000);
        await loadCustomGames();
        updateBadges();
        activeFilter = 'custom';
        updateFilterPillUI();
        renderAll();
      } else {
        uploadStatus.textContent = 'Upload failed. Please sign in with your Google account.';
        uploadStatus.style.color = '#ef4444';
      }
      e.target.value = '';
    }
  });

  // ==========================================
  // 5. Render Pipeline
  // ==========================================
  function renderAll() {
    gamesGrid.innerHTML = '';
    recentGamesGrid.innerHTML = '';
    favGamesGrid.innerHTML = '';
    customGamesGrid.innerHTML = '';

    // Determine current filtered dataset based on active filter
    let sourceList = allGames;
    if (activeFilter === 'favs') {
      libraryHeadingTitle.textContent = 'Favorite Games';
      sourceList = allGames.filter(g => prefs.favorites.includes(g.id))
        .concat(allCustomGames.filter(g => prefs.favorites.includes(g.id)));
    } else if (activeFilter === 'recents') {
      libraryHeadingTitle.textContent = 'Recently Played Games';
      sourceList = prefs.recents.map(id => allGames.find(g => g.id === id) || allCustomGames.find(g => g.id === id)).filter(Boolean);
    } else if (activeFilter === 'custom') {
      libraryHeadingTitle.textContent = 'Custom Uploaded Games';
      sourceList = allCustomGames;
    } else {
      libraryHeadingTitle.textContent = 'All Games Catalog';
      sourceList = allGames;
    }

    // Apply search query
    let filteredList = sourceList;
    if (searchQuery) {
      filteredList = sourceList.filter(g => 
        (g.name && g.name.toLowerCase().includes(searchQuery)) ||
        (g.file && g.file.toLowerCase().includes(searchQuery)) ||
        (g.type && g.type.toLowerCase().includes(searchQuery))
      );
    }

    // Render Recent & Favorites sections on main "all" view when no search query
    if (activeFilter === 'all' && !searchQuery) {
      // Recent section
      const recentGames = prefs.recents.map(id => allGames.find(g => g.id === id) || allCustomGames.find(g => g.id === id)).filter(Boolean);
      if (recentGames.length > 0) {
        recentSection.style.display = 'block';
        recentGames.slice(0, 6).forEach(g => {
          renderGameCard(g, recentGamesGrid, allCustomGames.some(c => c.id === g.id));
        });
      } else {
        recentSection.style.display = 'none';
      }

      // Favorites section
      const favGames = prefs.favorites.map(id => allGames.find(g => g.id === id) || allCustomGames.find(g => g.id === id)).filter(Boolean);
      if (favGames.length > 0) {
        favSection.style.display = 'block';
        favGames.slice(0, 8).forEach(g => {
          renderGameCard(g, favGamesGrid, allCustomGames.some(c => c.id === g.id));
        });
      } else {
        favSection.style.display = 'none';
      }
    } else {
      recentSection.style.display = 'none';
      favSection.style.display = 'none';
    }

    // Render Main Grid with chunk pagination
    const totalMatching = filteredList.length;
    resultsCount.textContent = `Showing ${Math.min(displayedGamesCount, totalMatching)} of ${totalMatching} games`;

    if (totalMatching === 0) {
      noResults.style.display = 'block';
      loadMoreContainer.style.display = 'none';
    } else {
      noResults.style.display = 'none';
      const visibleChunk = filteredList.slice(0, displayedGamesCount);
      visibleChunk.forEach(game => {
        renderGameCard(game, gamesGrid, allCustomGames.some(c => c.id === game.id));
      });

      // Show/Hide Load More Button
      if (totalMatching > displayedGamesCount) {
        loadMoreContainer.style.display = 'block';
        loadMoreBtn.textContent = `Load More Games (${totalMatching - displayedGamesCount} remaining)`;
      } else {
        loadMoreContainer.style.display = 'none';
      }
    }
  }

  function renderGameCard(game, container, isCustom = false) {
    const card = document.createElement('div');
    card.className = 'game-card';
    const isFav = prefs.favorites.includes(game.id);

    const displayName = game.name || game.file.replace('.jar', '');
    const fallbackSvg = isCustom
      ? `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>`
      : `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"></rect><path d="M6 12h4m-2-2v4m7-1h.01m2.99-2h.01"></path></svg>`;

    card.innerHTML = `
      <div class="fav-btn" data-id="${game.id}" title="Toggle Favorite">
        <svg class="fav-star-icon" width="20" height="20" viewBox="0 0 24 24" fill="${isFav ? '#ffc107' : 'none'}" stroke="${isFav ? '#ffc107' : 'rgba(255,255,255,0.35)'}" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
      </div>
      <div class="game-card-content">
        <div class="game-icon-frame">
          <div class="game-icon-fallback">${fallbackSvg}</div>
          ${game.icon ? `<img src="${game.icon}" class="game-icon-img" alt="" loading="lazy" />` : ''}
        </div>
        <h3 class="game-title" title="${displayName}">${displayName}</h3>
      </div>
      <button class="game-play-btn">Play Now</button>
    `;

    // Safe error handler for icon image without inline HTML quoting
    const iconImg = card.querySelector('.game-icon-img');
    if (iconImg) {
      iconImg.addEventListener('error', () => {
        iconImg.style.display = 'none';
      });
    }

    // Favorite click
    const favStar = card.querySelector('.fav-btn');
    favStar.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(game);
    });

    // Play click
    card.addEventListener('click', () => {
      addToRecents(game);
      openGame(game, isCustom);
    });

    container.appendChild(card);
  }

  function toggleFavorite(game) {
    const isNowFav = !prefs.favorites.includes(game.id);
    if (isNowFav) {
      prefs.favorites.push(game.id);
    } else {
      prefs.favorites = prefs.favorites.filter(id => id !== game.id);
    }

    // 1. Instant optimistic visual star toggle across all cards on screen
    document.querySelectorAll(`.fav-btn[data-id="${game.id}"] .fav-star-icon`).forEach(starSvg => {
      starSvg.setAttribute('fill', isNowFav ? '#ffc107' : 'none');
      starSvg.setAttribute('stroke', isNowFav ? '#ffc107' : 'rgba(255,255,255,0.35)');
    });

    // 2. Instant badge update
    updateBadges();

    // 3. Instant shelf update
    if (activeFilter === 'favs') {
      renderAll();
    } else if (activeFilter === 'all' && !searchQuery) {
      updateFavShelf();
    }

    // 4. Non-blocking background save
    savePreferences(prefs);
  }

  function updateFavShelf() {
    const favGames = prefs.favorites.map(id => allGames.find(g => g.id === id) || allCustomGames.find(g => g.id === id)).filter(Boolean);
    if (favGames.length > 0) {
      favSection.style.display = 'block';
      favGamesGrid.innerHTML = '';
      favGames.slice(0, 8).forEach(g => {
        renderGameCard(g, favGamesGrid, allCustomGames.some(c => c.id === g.id));
      });
    } else {
      favSection.style.display = 'none';
      favGamesGrid.innerHTML = '';
    }
  }

  function addToRecents(game) {
    prefs.recents = prefs.recents.filter(id => id !== game.id);
    prefs.recents.unshift(game.id);
    if (prefs.recents.length > 20) prefs.recents.pop();
    updateBadges();
    savePreferences(prefs);
  }

  // ==========================================
  // 6. Game Player Modal
  // ==========================================
  async function openGame(game, isCustom = false) {
    const jarTarget = isCustom ? game.url : game.file;
    const gameName = game.name || game.file;

    modalGameTitle.textContent = gameName;

    // Pull latest game progress and RMS saves from cloud before launching
    if (currentUser) {
      try {
        await loadFromCloud();
      } catch (err) {
        console.warn('Pre-game cloud load notice:', err);
      }
    }

    const url = new URL(window.location.origin + '/run.html');
    url.searchParams.set('jar', jarTarget);

    // Auto-enable touch keypad if mobile or tablet device
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || (window.innerWidth <= 1024);
    if (isTouchDevice) {
      url.searchParams.set('mobile', 'true');
    }

    gameFrame.src = url.toString();
    playerModal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  async function closeModal() {
    playerModal.classList.remove('show');
    modalContent.classList.remove('fullscreen-active');
    
    // Sync progress to cloud on exit
    await syncToCloud();

    setTimeout(() => {
      gameFrame.src = '';
      document.body.style.overflow = '';
      renderAll();
    }, 300);
  }

  // Periodic auto-sync while in-game (every 40 seconds)
  setInterval(() => {
    if (playerModal.classList.contains('show')) {
      syncToCloud();
    }
  }, 40000);

  // Auto-sync on app minimization, tab switch, or browser close
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && playerModal.classList.contains('show')) {
      syncToCloud();
    }
  });

  window.addEventListener('beforeunload', () => {
    if (playerModal.classList.contains('show')) {
      syncToCloud();
    }
  });

  modalCloseBtn.addEventListener('click', closeModal);

  playerModal.addEventListener('click', (e) => {
    if (e.target === playerModal) {
      closeModal();
    }
  });

  // Fullscreen button in modal
  toggleFullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      if (playerModal.requestFullscreen) {
        playerModal.requestFullscreen().catch(err => console.log(err));
      }
      modalContent.classList.add('fullscreen-active');
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(err => console.log(err));
      }
      modalContent.classList.remove('fullscreen-active');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && playerModal.classList.contains('show')) {
      closeModal();
    }
  });

  // ==========================================
  // 7. FAQ Accordion Handling
  // ==========================================
  faqItems.forEach(item => {
    const questionBtn = item.querySelector('.faq-question');
    const toggleIcon = item.querySelector('.faq-toggle-icon');
    questionBtn.addEventListener('click', () => {
      const isOpen = item.classList.contains('active');
      faqItems.forEach(i => {
        i.classList.remove('active');
        const icon = i.querySelector('.faq-toggle-icon');
        if (icon) icon.textContent = '+';
      });
      if (!isOpen) {
        item.classList.add('active');
        toggleIcon.textContent = '−';
      }
    });
  });

  // ==========================================
  // 8. Support & Feedback Form
  // ==========================================
  if (supportForm) {
    supportForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('feedbackName').value.trim();
      const email = document.getElementById('feedbackEmail').value.trim();
      const type = document.getElementById('feedbackType').value;
      const message = document.getElementById('feedbackMessage').value.trim();

      feedbackResult.className = 'feedback-result success';
      feedbackResult.style.display = 'block';
      feedbackResult.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" style="vertical-align: middle; margin-right: 6px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
        Thank you, <strong>${name}</strong>! Your message (${type}) has been logged. Vedant will review your feedback at <em>contactsvedant@gmail.com</em>.
      `;

      supportForm.reset();
      setTimeout(() => {
        feedbackResult.style.display = 'none';
      }, 7000);
    });
  }
});
