(function () {
  "use strict";

  var API = "/api/v1";
  var TOKEN_KEY = "omnianote_admin_access_token";
  var REFRESH_KEY = "omnianote_admin_refresh_token";

  function getTokens() {
    return { access: localStorage.getItem(TOKEN_KEY), refresh: localStorage.getItem(REFRESH_KEY) };
  }
  function setTokens(access, refresh) {
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  }
  function clearTokens() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }

  // Mirrors the mobile app's apiClient: single retry after a silent refresh on 401.
  function apiFetch(path, options, retried) {
    options = options || {};
    var access = getTokens().access;
    var headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    if (access) headers.Authorization = "Bearer " + access;
    return fetch(API + path, Object.assign({}, options, { headers: headers })).then(function (res) {
      if (res.status === 401 && !retried) {
        var refresh = getTokens().refresh;
        if (!refresh) return Promise.reject(new Error("Not signed in"));
        return fetch(API + "/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: refresh }),
        })
          .then(function (r) {
            if (!r.ok) throw new Error("Session expired");
            return r.json();
          })
          .then(function (tokens) {
            setTokens(tokens.accessToken, tokens.refreshToken);
            return apiFetch(path, options, true);
          });
      }
      return res.json().then(function (body) {
        if (!res.ok) throw new Error(body.message || res.statusText);
        return body;
      });
    });
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === "text") node.textContent = attrs[key];
      else if (key === "html") node.innerHTML = attrs[key];
      else if (key.indexOf("on") === 0) node.addEventListener(key.slice(2).toLowerCase(), attrs[key]);
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function fmtBytes(bytes) {
    if (!bytes) return "0 B";
    var units = ["B", "KB", "MB", "GB", "TB"];
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + " " + units[i];
  }

  var app = document.getElementById("app");

  function renderLogin(message) {
    app.innerHTML = "";
    var emailInput = el("input", { placeholder: "Email or username", autocapitalize: "none" });
    var passwordInput = el("input", { type: "password", placeholder: "Password" });
    var codeInput = el("input", { placeholder: "6-digit code", style: "display:none" });
    var errorEl = el("p", { class: "error", text: message || "" });
    var challengeToken = null;

    function submit(e) {
      e.preventDefault();
      errorEl.textContent = "";
      if (challengeToken) {
        apiFetch("/auth/mfa/challenge/verify", {
          method: "POST",
          body: JSON.stringify({ challengeToken: challengeToken, code: codeInput.value.trim() }),
        })
          .then(function (tokens) {
            setTokens(tokens.accessToken, tokens.refreshToken);
            boot();
          })
          .catch(function (err) {
            errorEl.textContent = err.message;
          });
        return;
      }
      apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ emailOrUsername: emailInput.value.trim(), password: passwordInput.value }),
      })
        .then(function (result) {
          if (result.mfaRequired) {
            challengeToken = result.challengeToken;
            passwordInput.style.display = "none";
            codeInput.style.display = "";
            errorEl.textContent = "Enter your 6-digit code.";
            return;
          }
          setTokens(result.accessToken, result.refreshToken);
          boot();
        })
        .catch(function (err) {
          errorEl.textContent = err.message;
        });
    }

    var form = el("form", { onsubmit: submit }, [
      emailInput,
      passwordInput,
      codeInput,
      errorEl,
      el("button", { class: "primary", type: "submit", text: "Sign in" }),
    ]);
    app.appendChild(el("div", { id: "login-screen" }, [el("h1", { text: "OmniaNote Admin" }), form]));
    emailInput.focus();
  }

  function renderForbidden() {
    app.innerHTML = "";
    app.appendChild(
      el("div", { id: "login-screen" }, [
        el("h1", { text: "OmniaNote Admin" }),
        el("p", { class: "error", text: "That account doesn't have admin access." }),
        el("button", {
          text: "Sign out",
          onclick: function () {
            clearTokens();
            renderLogin();
          },
        }),
      ]),
    );
  }

  function statCard(value, label) {
    return el("div", { class: "stat-card" }, [el("div", { class: "value", text: value }), el("div", { class: "label", text: label })]);
  }

  function renderOverview(container, overview) {
    container.appendChild(el("h2", { text: "Overview" }));
    var tierLine = Object.keys(overview.accountsByTier)
      .map(function (tier) {
        return tier + " " + overview.accountsByTier[tier];
      })
      .join(" · ");
    container.appendChild(
      el("div", { class: "stat-grid" }, [
        statCard(String(overview.totalAccounts), "accounts (" + tierLine + ")"),
        statCard(String(overview.totalUsers), "total users"),
        statCard(String(overview.onlineNow), "online now"),
        statCard(String(overview.activeLast24h), "active last 24h"),
        statCard(String(overview.activeLast7d), "active last 7d"),
        statCard(String(overview.newUsersLast30d), "new users last 30d"),
        statCard(String(overview.totalItems), "items captured"),
        statCard(fmtBytes(overview.totalStorageBytes), "storage used"),
        statCard(String(overview.errorsLast24h), "errors last 24h"),
      ]),
    );

    var subKeys = Object.keys(overview.subscriptionsByStatus);
    if (subKeys.length > 0) {
      container.appendChild(el("h2", { text: "Subscriptions" }));
      container.appendChild(
        el(
          "div",
          { class: "stat-grid" },
          subKeys.map(function (status) {
            return statCard(String(overview.subscriptionsByStatus[status]), status);
          }),
        ),
      );
    }

    container.appendChild(el("h2", { text: "Geography" }));
    if (overview.countryBreakdown.length === 0) {
      container.appendChild(el("p", { class: "empty", text: "No country data yet — only known when requests come through Cloudflare." }));
    } else {
      var rows = overview.countryBreakdown.map(function (row) {
        return el("tr", {}, [el("td", { text: row.country }), el("td", { class: "num", text: String(row.count) })]);
      });
      container.appendChild(
        el("div", { class: "table-wrap" }, [
          el("table", {}, [el("thead", {}, [el("tr", {}, [el("th", { text: "Country" }), el("th", { text: "Users" })])]), el("tbody", {}, rows)]),
        ]),
      );
    }
  }

  function renderHealth(container, health) {
    container.appendChild(el("h2", { text: "Health" }));
    var uptimeH = Math.floor(health.uptimeSeconds / 3600);
    var uptimeM = Math.floor((health.uptimeSeconds % 3600) / 60);
    container.appendChild(el("p", { class: "empty", text: "API process uptime: " + uptimeH + "h " + uptimeM + "m" }));
    var badges = Object.keys(health.checks).map(function (name) {
      var ok = health.checks[name];
      return el("span", { class: "badge " + (ok ? "ok" : "bad"), text: (ok ? "● " : "● ") + name });
    });
    container.appendChild(el("div", { class: "health-grid" }, badges));
  }

  function renderAccounts(container) {
    container.appendChild(el("h2", { text: "Accounts" }));
    var searchInput = el("input", { placeholder: "Search by name, email, or username", style: "flex:1" });
    var tbody = el("tbody", {});
    var nextBtn = el("button", { text: "Next page →" });
    var cursorStack = [undefined];

    function load(cursor, search) {
      var qs = "?limit=25" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "") + (search ? "&search=" + encodeURIComponent(search) : "");
      apiFetch("/admin/accounts" + qs).then(function (result) {
        tbody.innerHTML = "";
        result.accounts.forEach(function (account) {
          tbody.appendChild(
            el("tr", {}, [
              el("td", { text: account.name || "(unnamed)" }),
              el("td", { text: account.tier }),
              el("td", { class: "num", text: String(account.memberCount) }),
              el("td", { class: "num", text: String(account.itemCount) }),
              el("td", { class: "num", text: fmtBytes(account.storageUsedBytes) }),
              el("td", { text: new Date(account.createdAt).toLocaleDateString() }),
            ]),
          );
        });
        nextBtn.disabled = !result.nextCursor;
        nextBtn.onclick = function () {
          cursorStack.push(result.nextCursor);
          load(result.nextCursor, searchInput.value.trim());
        };
      });
    }

    var toolbar = el(
      "form",
      {
        class: "toolbar",
        onsubmit: function (e) {
          e.preventDefault();
          cursorStack = [undefined];
          load(undefined, searchInput.value.trim());
        },
      },
      [searchInput, el("button", { type: "submit", text: "Search" })],
    );

    container.appendChild(toolbar);
    container.appendChild(
      el("div", { class: "table-wrap" }, [
        el("table", {}, [
          el("thead", {}, [
            el("tr", {}, [
              el("th", { text: "Account" }),
              el("th", { text: "Tier" }),
              el("th", { text: "Members" }),
              el("th", { text: "Items" }),
              el("th", { text: "Storage" }),
              el("th", { text: "Created" }),
            ]),
          ]),
          tbody,
        ]),
      ]),
    );
    container.appendChild(el("div", { class: "pager" }, [nextBtn]));
    load();
  }

  function renderErrors(container) {
    container.appendChild(el("h2", { text: "Recent errors" }));
    var list = el("div", {});
    var nextBtn = el("button", { text: "Next page →" });

    function load(cursor) {
      var qs = "?limit=25" + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
      apiFetch("/admin/errors" + qs).then(function (result) {
        list.innerHTML = "";
        if (result.errors.length === 0) {
          list.appendChild(el("p", { class: "empty", text: "No errors logged." }));
        }
        result.errors.forEach(function (err) {
          var summary = el("summary", {
            text: new Date(err.createdAt).toLocaleString() + " — " + err.statusCode + " " + err.method + " " + err.path + " — " + err.message,
          });
          var details = el(
            "details",
            { style: "margin-bottom:0.6rem;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:0.6rem 0.8rem;" },
            [summary, err.stack ? el("pre", { class: "stack", text: err.stack }) : null],
          );
          list.appendChild(details);
        });
        nextBtn.disabled = !result.nextCursor;
        nextBtn.onclick = function () {
          load(result.nextCursor);
        };
      });
    }

    container.appendChild(list);
    container.appendChild(el("div", { class: "pager" }, [nextBtn]));
    load();
  }

  function renderDashboard() {
    app.innerHTML = "";
    var content = el("div", {});
    app.appendChild(
      el("div", {}, [
        el("div", { class: "topbar" }, [
          el("h1", { text: "OmniaNote Admin" }),
          el("button", {
            text: "Sign out",
            onclick: function () {
              clearTokens();
              renderLogin();
            },
          }),
        ]),
        content,
      ]),
    );

    Promise.all([apiFetch("/admin/overview"), apiFetch("/admin/health")])
      .then(function (results) {
        renderOverview(content, results[0]);
        renderHealth(content, results[1]);
        renderAccounts(content);
        renderErrors(content);
      })
      .catch(function (err) {
        content.appendChild(el("p", { class: "error", text: err.message }));
      });
  }

  function boot() {
    var tokens = getTokens();
    if (!tokens.access) {
      renderLogin();
      return;
    }
    apiFetch("/admin/overview")
      .then(function () {
        renderDashboard();
      })
      .catch(function (err) {
        if (String(err.message).toLowerCase().indexOf("admin access") !== -1) {
          renderForbidden();
        } else {
          clearTokens();
          renderLogin();
        }
      });
  }

  boot();
})();
