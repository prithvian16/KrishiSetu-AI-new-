
    const homeEl = document.getElementById("home");
    const cropEl = document.getElementById("crop");
    const queueEl = document.getElementById("queue");
    const profileEl = document.getElementById("profile");
    const subEl = document.getElementById("sub");
    const farmerId = localStorage.getItem("farmerId");

    let data = null;
    let booking = null;
    let photoData = "";

    if (!farmerId) {
      window.location.href = "/login.html";
    }

    function showTab(name) {
      ["home", "crop", "queue", "profile"].forEach((tabName) => {
        document.getElementById(tabName).classList.toggle("hidden", tabName !== name);
        document.getElementById("n-" + tabName).classList.toggle("active", tabName === name);
      });

      if (name === "crop") renderCrop();
      if (name === "queue") renderQueue();
    }

    async function loadDashboard() {
      try {
        data = await api("/api/farmers/" + farmerId);
        const activeBooking = await api("/api/farmers/" + farmerId + "/active-booking");
        booking = activeBooking || null;
        render();
      } catch (error) {
        homeEl.innerHTML =
          '<div class="mobile-card notice error"><b>Could not load account</b><p>' +
          escapeHtml(error.message) +
          '</p><button class="mobile-btn" onclick="loadDashboard()">Retry</button></div>';
      }
    }

    function render() {
      subEl.textContent = data.farmer.name + " · " + data.farmer.farmerId;

      const bookingCard = booking
        ? `
          <div class="mobile-card">
            <div class="kpi">
              <b>Active token</b>
              <span class="badge">${escapeHtml(booking.status)}</span>
            </div>
            <div class="mobile-stat">${escapeHtml(booking.tokenCode)}</div>
            <p>${escapeHtml(booking.centre.name)}</p>
            <p><b>Queue #${escapeHtml(booking.queuePosition)}</b> · ETA ${escapeHtml(booking.etaMin)}–${escapeHtml(booking.etaMax)} min</p>
            <button class="mobile-btn" id="trackQueueBtn">Track live queue</button>
          </div>`
        : `
          <div class="mobile-card">
            <h3>Before you travel</h3>
            <p class="muted">Register your crop to get a preliminary assessment and smart centre recommendation.</p>
          </div>`;

      const records = data.cropRecords || [];
      const cropRows = records.slice(0, 2).map((record) => `
        <p><b>${escapeHtml(record.cropType)}</b> · ${escapeHtml(record.estimatedQuantity)} qtl · Grade ${escapeHtml(record.aiScreening?.grade || "Pending")}</p>
      `).join("");

      homeEl.innerHTML = `
        <div class="mobile-card green">
          <div class="small">Welcome back</div>
          <h2>${escapeHtml(data.farmer.name)}</h2>
          <p>Plan your procurement visit before travelling to the centre.</p>
          <button class="mobile-btn" id="registerCropBtn">Register crop</button>
        </div>
        ${bookingCard}
        <div class="mobile-card">
          <div class="kpi">
            <b>Your crop records</b>
            <span class="pill">${records.length}</span>
          </div>
          ${cropRows || '<p class="muted">No crop records yet.</p>'}
        </div>`;

      const registerBtn = document.getElementById("registerCropBtn");
      if (registerBtn) registerBtn.onclick = () => showTab("crop");

      const trackBtn = document.getElementById("trackQueueBtn");
      if (trackBtn) trackBtn.onclick = () => showTab("queue");

      renderCrop();
      renderProfile();
    }

    function renderCrop() {
      cropEl.innerHTML = `
        <div class="mobile-card">
          <h2>🌾 Register crop</h2>
          <p class="muted">Pre-procurement intelligence helps you plan before visiting a centre.</p>
          <form id="cropForm">
            <div class="field"><label>Crop type</label>
              <select name="cropType"><option>Wheat</option><option>Paddy</option><option>Bajra</option><option>Maize</option></select>
            </div><br>
            <div class="field"><label>Estimated quantity (quintals)</label><input name="estimatedQuantity" type="number" min="1" required></div><br>
            <div class="field"><label>Field / village location</label><input name="location" required></div><br>
            <div class="field"><label>Crop photo</label><input name="photo" type="file" accept="image/*" id="photoInput"><img id="photoPreview" class="photo hidden"></div><br>
            <div class="field"><label>Visible damage</label>
              <select name="visibleDamage"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
            </div><br>
            <div class="field"><label>Estimated moisture %</label><input name="moisture" type="number" step="0.1" value="12"></div><br>
            <div class="field"><label>Visible impurity %</label><input name="impurity" type="number" step="0.1" value="1"></div><br>
            <div class="field"><label>Authorised procurement price ₹/quintal</label><input name="authorisedPrice" type="number" value="2300"></div><br>
            <div class="field"><label>Optional preferred minimum price ₹/quintal</label><input name="farmerPreferredPrice" type="number"></div><br>
            <button class="mobile-btn" type="submit">Analyse crop</button>
          </form>
          <div id="cropResult"></div>
        </div>`;

      const photoInput = document.getElementById("photoInput");
      if (photoInput) {
        photoInput.addEventListener("change", previewPhoto);
      }
    }

    function previewPhoto(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        photoData = reader.result;
        const preview = document.getElementById("photoPreview");
        preview.src = photoData;
        preview.classList.remove("hidden");
      };
      reader.readAsDataURL(file);
    }

    document.addEventListener("submit", async (event) => {
      if (event.target.id !== "cropForm") return;
      event.preventDefault();

      const form = new FormData(event.target);
      const resultEl = document.getElementById("cropResult");

      try {
        const cropRecord = await api("/api/procurement/crops", {
          method: "POST",
          body: JSON.stringify({
            farmerId,
            cropType: form.get("cropType"),
            estimatedQuantity: form.get("estimatedQuantity"),
            location: form.get("location"),
            cropPhotoUrl: photoData,
            visibleDamage: form.get("visibleDamage"),
            moisture: form.get("moisture"),
            impurity: form.get("impurity"),
            authorisedPrice: form.get("authorisedPrice"),
            farmerPreferredPrice: form.get("farmerPreferredPrice")
          })
        });

        localStorage.setItem("cropRecordId", cropRecord._id);
        resultEl.innerHTML = `
          <div class="notice">
            <b>Preliminary grade: ${escapeHtml(cropRecord.aiScreening.grade)}</b><br>
            Score ${escapeHtml(cropRecord.aiScreening.score)}/100<br>
            ${escapeHtml(cropRecord.aiScreening.disclaimer)}
          </div>
          <div class="mobile-card" style="margin-top:12px;background:#f7fbf7;border-color:#d8e8d9">
            <div class="quality-icon">👨‍🌾</div>
            <h3>Optional expert visit</h3>
            <p class="muted">Would you like an expert to check your crop at your farm before you travel? This is preliminary guidance. The final procurement decision is still made at the centre.</p>
            <div class="mobile-row">
              <button class="mobile-btn" id="visitBtn">Request expert visit</button>
              <button class="mobile-btn secondary" id="continueBtn">Continue without visit</button>
            </div>
            <div id="visitResult"></div>
          </div>`;

        document.getElementById("visitBtn").onclick = () => requestExpertVisit(cropRecord._id);
        document.getElementById("continueBtn").onclick = () => continueToRecommendations(cropRecord._id);

        data = await api("/api/farmers/" + farmerId);
      } catch (error) {
        resultEl.innerHTML = '<div class="notice error">' + escapeHtml(error.message) + "</div>";
      }
    });


    async function requestExpertVisit(cropRecordId) {
      const result = document.getElementById("visitResult");
      const button = document.getElementById("visitBtn");
      button.disabled = true;
      try {
        const visit = await api("/api/procurement/visit-request", {
          method: "POST",
          body: JSON.stringify({ farmerId, cropRecordId })
        });
        result.innerHTML = `
          <div class="notice" style="margin-top:10px">
            <b>Expert visit requested ✓</b><br>
            An inspector will review the request for <b>${escapeHtml(visit.location)}</b>.
            <span class="badge">${escapeHtml(visit.status)}</span>
          </div>
          <button class="mobile-btn secondary" id="visitContinueBtn">Continue to centre recommendations</button>`;
        document.getElementById("visitContinueBtn").onclick = () => continueToRecommendations(cropRecordId);
      } catch (error) {
        result.innerHTML = '<div class="notice error" style="margin-top:10px">' + escapeHtml(error.message) + '</div>';
        button.disabled = false;
      }
    }

    function continueToRecommendations(cropRecordId) {
      window.location.href = "/centres.html?crop=" + encodeURIComponent(cropRecordId);
    }

    function renderQueue() {
      if (!booking) {
        queueEl.innerHTML = `
          <div class="mobile-card">
            <h2>No active token</h2>
            <p class="muted">Register a crop and book a slot to see your live queue here.</p>
          </div>`;
        return;
      }

      const notifications = (booking.notifications || []).slice().reverse().map((notification) => `
        <div class="notice">${escapeHtml(notification.message)}</div>`).join("");

      queueEl.innerHTML = `
        <div class="mobile-card green">
          <div class="small">Live procurement token</div>
          <div class="token" style="color:#fff">${escapeHtml(booking.tokenCode)}</div>
          <p>${escapeHtml(booking.centre.name)}</p>
        </div>
        <div class="mobile-card">
          <div class="kpi"><b>Queue position</b><span class="mobile-stat">#${escapeHtml(booking.queuePosition)}</span></div>
          <div class="mini-progress"><div style="width:${Math.max(5, Math.min(95, 100 - (booking.queuePosition * 8)))}%"></div></div>
          <p>Estimated wait: <b>${escapeHtml(booking.etaMin)}–${escapeHtml(booking.etaMax)} min</b></p>
          <span class="badge">${escapeHtml(booking.status)}</span>
          <div class="row" style="margin-top:12px">
            <button class="mobile-btn secondary" id="arriveBtn">I have arrived</button>
            <button class="mobile-btn" id="cancelBtn" style="background:#ad4138">Cancel</button>
          </div>
        </div>
        <div class="mobile-card"><h3>Notifications</h3>${notifications || '<p class="muted">No notifications yet.</p>'}</div>`;

      document.getElementById("arriveBtn").onclick = arrive;
      document.getElementById("cancelBtn").onclick = cancelBooking;
    }

    async function arrive() {
      try {
        await api("/api/procurement/booking/" + booking._id + "/arrive", { method: "POST" });
        await loadDashboard();
        showTab("queue");
      } catch (error) {
        alert(error.message);
      }
    }

    async function cancelBooking() {
      if (!window.confirm("Cancel this booking?")) return;
      try {
        await api("/api/procurement/booking/" + booking._id + "/cancel", { method: "POST" });
        await loadDashboard();
        showTab("home");
      } catch (error) {
        alert(error.message);
      }
    }

    function renderProfile() {
      const bank = data.farmer.bank || {};
      profileEl.innerHTML = `
        <div class="mobile-card">
          <h2>👤 My profile</h2>
          <p><b>Name</b><br>${escapeHtml(data.farmer.name)}</p>
          <p><b>Farmer ID</b><br>${escapeHtml(data.farmer.farmerId)}</p>
          <p><b>Mobile</b><br>${escapeHtml(data.farmer.mobile)}</p>
          <p><b>Location</b><br>${escapeHtml(data.farmer.village)}, ${escapeHtml(data.farmer.district)}, ${escapeHtml(data.farmer.state)}</p>
          <p><b>Land</b><br>${escapeHtml(data.farmer.landArea || "—")} acres</p>
        </div>
        <div class="mobile-card">
          <h3>🏦 Payment profile</h3>
          <p><b>${escapeHtml(bank.accountHolderName)}</b><br>${escapeHtml(bank.bankName)} · ${escapeHtml(bank.ifsc)}</p>
          <p class="mask">Account: ${escapeHtml(bank.maskedAccountNumber)}</p>
          <span class="badge">${escapeHtml(bank.governmentSyncStatus)}</span>
          <p class="small muted">Government reference: ${escapeHtml(bank.governmentReferenceId || "—")}</p>
        </div>
        <button class="mobile-btn secondary" id="logoutBtn">Logout</button>`;

      document.getElementById("logoutBtn").onclick = () => {
        localStorage.clear();
        window.location.href = "/login.html";
      };
    }

    document.getElementById("refreshBtn").onclick = loadDashboard;
    document.getElementById("n-home").onclick = () => showTab("home");
    document.getElementById("n-crop").onclick = () => showTab("crop");
    document.getElementById("n-queue").onclick = () => showTab("queue");
    document.getElementById("n-profile").onclick = () => showTab("profile");

    loadDashboard();

    setInterval(async () => {
      if (!booking) return;
      try {
        booking = await api("/api/farmers/" + farmerId + "/active-booking");
        renderQueue();
      } catch (error) {
        console.error(error);
      }
    }, 8000);
  