// Inject CSS for user avatar/menu in header
(function () {
  const style = document.createElement('style');
  style.textContent = `
    .header-user { position: relative; }
    .header-avatar-btn {
      width: 34px; height: 34px; border-radius: 50%;
      border: 2px solid #2a2a2a; background: #161616;
      cursor: pointer; overflow: hidden; padding: 0;
      transition: border-color 0.15s;
      display: flex; align-items: center; justify-content: center;
    }
    .header-avatar-btn:hover { border-color: #7c6cff; }
    .header-avatar-img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .header-avatar-initial {
      width: 100%; height: 100%; display: flex; align-items: center;
      justify-content: center; font-size: 0.8rem; font-weight: 700;
      color: #fff; background: #7c6cff; font-family: inherit;
    }
    .header-user-menu {
      position: absolute; top: calc(100% + 10px); right: 0;
      background: #111111; border: 1px solid #2a2a2a; border-radius: 12px;
      padding: 14px; min-width: 210px; z-index: 200;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      display: none;
    }
    .header-user-menu.open { display: block; }
    .hum-name { font-size: 0.9rem; font-weight: 700; color: #fff; font-family: inherit; }
    .hum-email { font-size: 0.75rem; color: #888; margin-top: 3px; font-family: inherit; }
    .hum-divider { border: none; border-top: 1px solid #2a2a2a; margin: 10px 0; }
    .hum-btn {
      width: 100%; text-align: left; padding: 8px 10px;
      background: transparent; border: none; border-radius: 8px;
      color: #888; font-size: 0.85rem; font-weight: 500; cursor: pointer;
      font-family: inherit; transition: color 0.15s, background 0.15s;
    }
    .hum-btn:hover { color: #fff; background: rgba(255,255,255,0.06); }
  `;
  document.head.appendChild(style);

  // Check session
  fetch('/auth/me')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (!data?.user) return;
      const user = data.user;
      const loginBtn = document.querySelector('a[href="/login.html"].btn-login');
      if (!loginBtn) return;

      const avatarHTML = user.picture
        ? `<img src="${user.picture}" class="header-avatar-img" alt="${user.name}" />`
        : `<div class="header-avatar-initial">${user.name[0].toUpperCase()}</div>`;

      const el = document.createElement('div');
      el.className = 'header-user';
      el.id = 'header-user';
      el.innerHTML = `
        <button class="header-avatar-btn" id="avatar-btn" title="${user.name}">${avatarHTML}</button>
        <div class="header-user-menu" id="header-user-menu">
          <div class="hum-name">${user.name}</div>
          <div class="hum-email">${user.email}</div>
          <hr class="hum-divider">
          <button class="hum-btn" id="signout-btn">Sign out</button>
        </div>
      `;
      loginBtn.replaceWith(el);

      document.getElementById('avatar-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        document.getElementById('header-user-menu').classList.toggle('open');
      });

      document.getElementById('signout-btn').addEventListener('click', async function () {
        await fetch('/auth/logout', { method: 'POST' });
        window.location.reload();
      });

      document.addEventListener('click', function (e) {
        const menu = document.getElementById('header-user-menu');
        const userEl = document.getElementById('header-user');
        if (menu && userEl && !userEl.contains(e.target)) {
          menu.classList.remove('open');
        }
      });
    })
    .catch(() => {});
})();
