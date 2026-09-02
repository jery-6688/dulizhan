/* XINPUREAO — Shared JS: data + interactions */
window.AQUA = window.AQUA || {};

/* ========== LocalStorage Image Override ========== */
(function applyImageOverrides() {
  const STORAGE_KEY = "xinpureao_product_images";
  function getStored() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch { return {}; }
  }
  const stored = getStored();
  if (Object.keys(stored).length === 0) return;

  window.AQUA.products.forEach(function(p) {
    const mainKey = p.id + "_main";
    if (stored[mainKey]) {
      p.image = stored[mainKey];
      if (!p.gallery) p.gallery = [];
      p.gallery[0] = stored[mainKey];
    }
    for (var i = 0; i <= 4; i++) {
      var gk = p.id + "_gallery_" + i;
      if (stored[gk]) {
        if (!p.gallery) p.gallery = [];
        p.gallery[i] = stored[gk];
      }
    }
    if (p.longGallery && p.longGallery.length) {
      p.longGallery.forEach(function(item, i) {
        var lgk = p.id + "_longGallery_" + i;
        if (stored[lgk]) item.src = stored[lgk];
      });
    }
    var vpKey = p.id + "_videoPoster";
    if (stored[vpKey]) p.videoPoster = stored[vpKey];
  });
})();

/* ========== Header / Drawer ========== */
document.addEventListener("DOMContentLoaded", function(){
  /* ========== Settings patch ========== */
  if(window.AQUA.settings){
    document.querySelectorAll('[data-setting]').forEach(function(el){
      var key = el.getAttribute('data-setting');
      var val = key.split('.').reduce(function(o,k){return o==null?undefined:o[k];}, window.AQUA.settings);
      if(val!=null) el.innerHTML = val;
    });
  }

  /* ========== Page view tracking ========== */
  if(!location.pathname.endsWith('admin.html')){
    try{
      const p = location.pathname.split('/').pop() || 'index.html';
      const trackData = { path: p };
      if(p === 'product-detail.html'){
        const params = new URLSearchParams(location.search);
        const pid = params.get('id');
        if(pid){
          trackData.productId = pid;
          if(window.AQUA && window.AQUA.products){
            const prod = window.AQUA.products.find(x => x.id === pid);
            if(prod && prod.name) trackData.productName = prod.name;
          }
        }
      }
      const trackBody = JSON.stringify(trackData);
      if(navigator.sendBeacon){
        navigator.sendBeacon('/api/track', new Blob([trackBody], {type:'application/json'}));
      } else {
        fetch('/api/track', {method:'POST', headers:{'Content-Type':'application/json'}, body: trackBody, keepalive:true}).catch(()=>{});
      }
    }catch(e){}
  }

  /* ========== Burger / Drawer (after components rendered) ========== */
  const burger = document.getElementById("burger");
  const drawer = document.getElementById("drawer");
  const drawerClose = document.getElementById("drawerClose");
  if(burger && drawer){
    burger.addEventListener("click", ()=>{
      drawer.classList.remove("opacity-0","invisible");
      drawer.querySelector("#drawerPanel").classList.remove("translate-x-full");
    });
    const closeDrawer = ()=>{
      drawer.classList.add("opacity-0","invisible");
      drawer.querySelector("#drawerPanel").classList.add("translate-x-full");
    };
    if(drawerClose) drawerClose.addEventListener("click", closeDrawer);
    drawer.addEventListener("click", (e)=>{ if(e.target === drawer) closeDrawer(); });
  }

  /* ========== Footer Email Subscribe ========== */
  const subscribeBtn = document.getElementById("subscribeBtn");
  const subscribeEmail = document.getElementById("subscribeEmail");
  if(subscribeBtn && subscribeEmail){
    subscribeBtn.addEventListener("click", async () => {
      const email = subscribeEmail.value.trim();
      if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
        subscribeEmail.classList.add("!border-red-500");
        setTimeout(()=> subscribeEmail.classList.remove("!border-red-500"), 1500);
        return;
      }
      subscribeBtn.disabled = true;
      subscribeBtn.textContent = "Subscribing...";
      try {
        const res = await fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if(data.success){
          subscribeBtn.textContent = "Subscribed! ✓";
          subscribeEmail.value = "";
          setTimeout(()=>{ subscribeBtn.textContent = "Subscribe"; subscribeBtn.disabled = false; }, 3000);
        } else {
          subscribeBtn.textContent = "Failed";
          setTimeout(()=>{ subscribeBtn.textContent = "Subscribe"; subscribeBtn.disabled = false; }, 2000);
        }
      } catch {
        subscribeBtn.textContent = "Error";
        setTimeout(()=>{ subscribeBtn.textContent = "Subscribe"; subscribeBtn.disabled = false; }, 2000);
      }
    });
    subscribeEmail.addEventListener("keypress", (e)=>{ if(e.key==="Enter") subscribeBtn.click(); });
  }

  /* ========== Hero Carousel ========== */
  const carousel = document.getElementById("heroCarousel");
  if(carousel){
    const slides = carousel.querySelectorAll(".carousel-slide");
    const dotsContainer = document.querySelector(".desktop-carousel-dots");
    const prevBtn = document.querySelector(".carousel-prev");
    const nextBtn = document.querySelector(".carousel-next");
    let current = 0;
    let autoTimer = null;

    slides.forEach((s,i)=>{
      const dot = document.createElement("button");
      dot.className = i===0 ? "is-active" : "";
      dot.setAttribute("aria-label","Go to slide "+(i+1));
      dot.addEventListener("click",()=> goTo(i));
      dotsContainer && dotsContainer.appendChild(dot);
    });

    function goTo(idx){
      current = (idx+slides.length)%slides.length;
      slides.forEach((s,i)=>{ s.style.opacity = i===current?"1":"0"; });
      if(dotsContainer){
        dotsContainer.querySelectorAll("button").forEach((d,i)=>{
          d.classList.toggle("is-active", i===current);
        });
      }
    }
    function startAuto(){ autoTimer = setInterval(()=> goTo(current+1), 5000); }
    function resetAuto(){ clearInterval(autoTimer); startAuto(); }

    prevBtn && prevBtn.addEventListener("click",()=> { goTo(current-1); resetAuto(); });
    nextBtn && nextBtn.addEventListener("click",()=> { goTo(current+1); resetAuto(); });
    startAuto();
  }

  /* ========== Mobile Hero Carousel ========== */
  const mobileHeroCarousel = document.getElementById("heroMobileCarousel");
  if(mobileHeroCarousel){
    const slides = mobileHeroCarousel.querySelectorAll(".mobile-carousel-slide");
    const dotsContainer = document.querySelector(".mobile-carousel-dots");
    let current = 0;
    let autoTimer = null;

    slides.forEach((s,i)=>{
      const dot = document.createElement("button");
      dot.className = i===0 ? "is-active" : "";
      dot.setAttribute("aria-label","Go to slide "+(i+1));
      dot.addEventListener("click",()=> goTo(i));
      dotsContainer && dotsContainer.appendChild(dot);
    });

    function goTo(idx){
      current = (idx+slides.length)%slides.length;
      slides.forEach((s,i)=>{ s.style.opacity = i===current?"1":"0"; });
      if(dotsContainer){
        dotsContainer.querySelectorAll("button").forEach((d,i)=>{
          d.classList.toggle("is-active", i===current);
        });
      }
    }
    function startAuto(){ autoTimer = setInterval(()=> goTo(current+1), 5000); }
    startAuto();
  }

  /* ========== Factory Carousel ========== */
  const factoryCarousel = document.getElementById("factoryCarousel");
  if(factoryCarousel){
    const slides = factoryCarousel.querySelectorAll(".factory-slide");
    const dotsContainer = document.querySelector(".factory-dots");
    let current = 0;
    let autoTimer = null;

    slides.forEach((s,i)=>{
      const dot = document.createElement("button");
      dot.className = i===0 ? "w-2 h-2 rounded-full bg-white/60 is-active" : "w-2 h-2 rounded-full bg-white/40";
      dot.setAttribute("aria-label","Go to slide "+(i+1));
      dot.addEventListener("click",()=> goTo(i));
      dotsContainer && dotsContainer.appendChild(dot);
    });

    function goTo(idx){
      current = (idx+slides.length)%slides.length;
      slides.forEach((s,i)=>{ s.style.opacity = i===current?"1":"0"; });
      if(dotsContainer){
        dotsContainer.querySelectorAll("button").forEach((d,i)=>{
          d.classList.toggle("is-active", i===current);
          d.classList.toggle("bg-white/60", i===current);
          d.classList.toggle("bg-white/40", i!==current);
        });
      }
    }
    function startAuto(){ autoTimer = setInterval(()=> goTo(current+1), 4000); }
    startAuto();
  }

  /* ========== Scroll reveal ========== */
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    });
  },{threshold:0.12});
  document.querySelectorAll(".reveal").forEach(el=> io.observe(el));

  /* ========== Counter animation ========== */
  const counters = document.querySelectorAll("[data-count]");
  if(counters.length){
    const ci = new IntersectionObserver((entries)=>{
      entries.forEach(e=>{
        if(e.isIntersecting){
          const el = e.target;
          const target = parseFloat(el.dataset.count);
          const suffix = el.dataset.suffix || "";
          const duration = 1600;
          const start = performance.now();
          (function step(now){
            const p = Math.min(1,(now-start)/duration);
            const eased = 1 - Math.pow(1-p,3);
            const val = target*eased;
            el.textContent = (target%1===0 ? Math.floor(val) : val.toFixed(1)) + suffix;
            if(p<1) requestAnimationFrame(step);
          })(performance.now());
          ci.unobserve(el);
        }
      });
    },{threshold:0.5});
    counters.forEach(c=> ci.observe(c));
  }

  /* ========== Homepage Category Showcase ========== */
  const homeCategoryList = document.getElementById("homeCategoryList");
  if(homeCategoryList){
    homeCategoryList.innerHTML = window.AQUA.categories.map(c=>`
      <a href="products.html?cat=${c.id}" class="group flex flex-col">
        <div class="relative rounded-2xl overflow-hidden aspect-square bg-[#f0ece4] mb-4 group-hover:shadow-lg transition-shadow flex-shrink-0">
          <img src="${c.image}" alt="${c.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
        </div>
        <h3 class="text-base font-semibold text-[#0b1b33] mb-1">${c.name}</h3>
        <p class="text-xs text-textsoft mb-4 line-clamp-2 min-h-[2rem]">${c.desc}</p>
        <span class="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-[#0b1b33] group-hover:text-accent transition-colors">
          View Products <i class="fa-solid fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
        </span>
      </a>
    `).join("");
  }

  /* ========== Product filter (products page) ========== */
  const filterBar = document.querySelector("#filterBar");
  if(filterBar){
    const chips = filterBar.querySelectorAll(".chip");
    const search = filterBar.querySelector("input[type=search]");
    const sort = filterBar.querySelector("select");
    const list = document.querySelector("#productList");

    const urlParams = new URLSearchParams(window.location.search);
    const urlCat = urlParams.get("cat");
    if(urlCat){
      filterBar.dataset.category = urlCat;
      chips.forEach(c=>{
        c.classList.toggle("is-active", c.dataset.category === urlCat);
      });
    }

    function render(){
      const cat = filterBar.dataset.category || "all";
      const q = (search.value || "").toLowerCase().trim();
      let items = window.AQUA.products.filter(p=>{
        if(p.category === "oem-odm") return false;
        const matchCat = cat==="all" || p.category===cat;
        const matchQ = !q || (p.name+p.short+p.sku).toLowerCase().indexOf(q)>-1;
        return matchCat && matchQ;
      });
      if(sort && sort.value==="name") items.sort((a,b)=> a.name.localeCompare(b.name));
      if(sort && sort.value==="moq") items.sort((a,b)=> (a.moq||0)-(b.moq||0));

      list.innerHTML = items.map(p=>`
        <div class="group bg-bgsoft rounded-2xl overflow-hidden reveal flex flex-col" data-id="${p.id}">
          <a href="product-detail.html?id=${p.id}" class="relative aspect-[3/4] overflow-hidden bg-[#f2f7fc] flex-shrink-0 rounded-2xl m-3 mb-0 cursor-pointer">
            <img src="${p.image || 'https://images.unsplash.com/photo-1595514535215-9a5e5e03ae01?auto=format&fit=crop&w=900&q=70'}" alt="${p.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
          </a>
          <div class="p-4 flex flex-col flex-1">
            <a href="product-detail.html?id=${p.id}" class="font-medium text-[#0b1b33] mb-2 text-base leading-snug line-clamp-2 min-h-[3rem] hover:text-primary transition-colors">${p.name}</a>
            <div class="text-base font-semibold text-[#0b1b33] mb-3 flex-shrink-0 whitespace-nowrap min-h-[1.5rem]">${p.price || 'From $' + (Math.floor(Math.random()*30)+20) + '.00'}</div>
            <div class="flex items-center gap-1 mb-4 flex-shrink-0 min-h-[1.25rem]">
              <div class="flex items-center gap-0.5 text-yellow-400">
                <i class="fa-solid fa-star text-xs"></i>
                <i class="fa-solid fa-star text-xs"></i>
                <i class="fa-solid fa-star text-xs"></i>
                <i class="fa-solid fa-star text-xs"></i>
                <i class="fa-solid fa-star text-xs"></i>
              </div>
              <span class="text-xs text-textsoft">(${p.reviews || Math.floor(Math.random()*2000)+100})</span>
            </div>
            <div class="mt-auto">
              <a href="product-detail.html?id=${p.id}" class="block w-full py-2 text-center text-sm font-medium text-[#0b1b33] border border-[#0b1b33] rounded-full hover:bg-[#0b1b33] hover:text-white transition-colors mb-2">View more</a>
              <a href="contact.html" class="block w-full py-2.5 text-center text-sm font-medium text-white bg-[#0b1b33] rounded-full hover:bg-[#1a2a44] transition-colors">Get a Quote</a>
            </div>
          </div>
        </div>
      `).join("") || `<p class="p-10 text-textlight text-center col-span-full">No products match your filter. Please try other keywords.</p>`;

      list.querySelectorAll(".reveal").forEach(el=> io.observe(el));
    }
    chips.forEach(c=> c.addEventListener("click",()=>{
      chips.forEach(x=> x.classList.remove("is-active"));
      c.classList.add("is-active");
      filterBar.dataset.category = c.dataset.category;
      render();
    }));
    if(search) search.addEventListener("input", render);
    if(sort) sort.addEventListener("change", render);
    render();
  }

  /* ========== News filter ========== */
  const newsFilter = document.querySelector("#newsFilter");
  if(newsFilter){
    const chips = newsFilter.querySelectorAll(".chip");
    const list = document.querySelector("#newsList");
    const search = document.querySelector("#newsSearch");
    function render(){
      const cat = newsFilter.dataset.category || "all";
      const q = (search && search.value || "").toLowerCase().trim();
      let items = window.AQUA.posts.filter(p=>{
        return (cat==="all" || p.cat===cat) && (!q || (p.title+p.excerpt).toLowerCase().indexOf(q)>-1);
      });
      list.innerHTML = items.map(p=>`
        <article class="post reveal">
          <a class="post-img" href="post.html?id=${p.id}"><img src="${p.cover || 'https://images.unsplash.com/photo-1582735686119-1399-48f10a88?auto=format&fit=crop&w=900&q=70'}" alt="${p.title}"></a>
          <div class="post-body">
            <div class="post-meta"><span class="post-cat">${p.cat}</span><span>${p.date}</span></div>
            <h3><a href="post.html?id=${p.id}">${p.title}</a></h3>
            <p>${p.excerpt}</p>
            <a class="btn-link" href="post.html?id=${p.id}">Read article →</a>
          </div>
        </article>
      `).join("") || `<p style="grid-column:1/-1;text-align:center;padding:40px;color:var(--c-text-light)">No articles found.</p>`;
      list.querySelectorAll(".reveal").forEach(el=> io.observe(el));
    }
    chips.forEach(c=> c.addEventListener("click",()=>{
      chips.forEach(x=> x.classList.remove("is-active"));
      c.classList.add("is-active");
      newsFilter.dataset.category = c.dataset.category;
      render();
    }));
    if(search) search.addEventListener("input", render);
    render();
  }

  /* ========== Downloads (email gate) ========== */
  const dlList = document.querySelector("#downloadList");
  if(dlList){
    dlList.innerHTML = window.AQUA.downloads.map((d,i)=>`
      <div class="download-card reveal">
        <div class="dl-icon">${d.icon}</div>
        <h4>${d.title}</h4>
        <small>${d.size}</small>
        <div class="dl-meta"><span>Updated 2025</span><a href="#" class="btn-link" data-idx="${i}" style="color:var(--c-primary);font-weight:700">Download →</a></div>
      </div>
    `).join("");
    dlList.querySelectorAll(".reveal").forEach(el=> io.observe(el));
    dlList.addEventListener("click",(e)=>{
      const btn = e.target.closest("[data-idx]");
      if(btn){
        e.preventDefault();
        const docTitle = window.AQUA.downloads[btn.dataset.idx]?.title || '产品文档';
        const countryOpts = `<option value="">Select your country</option>
          <option value="Afghanistan">Afghanistan</option>
          <option value="Albania">Albania</option>
          <option value="Algeria">Algeria</option>
          <option value="Andorra">Andorra</option>
          <option value="Angola">Angola</option>
          <option value="Argentina">Argentina</option>
          <option value="Armenia">Armenia</option>
          <option value="Australia">Australia</option>
          <option value="Austria">Austria</option>
          <option value="Azerbaijan">Azerbaijan</option>
          <option value="Bahamas">Bahamas</option>
          <option value="Bahrain">Bahrain</option>
          <option value="Bangladesh">Bangladesh</option>
          <option value="Belarus">Belarus</option>
          <option value="Belgium">Belgium</option>
          <option value="Belize">Belize</option>
          <option value="Benin">Benin</option>
          <option value="Bhutan">Bhutan</option>
          <option value="Bolivia">Bolivia</option>
          <option value="Bosnia and Herzegovina">Bosnia and Herzegovina</option>
          <option value="Botswana">Botswana</option>
          <option value="Brazil">Brazil</option>
          <option value="Brunei">Brunei</option>
          <option value="Bulgaria">Bulgaria</option>
          <option value="Burkina Faso">Burkina Faso</option>
          <option value="Burundi">Burundi</option>
          <option value="Cambodia">Cambodia</option>
          <option value="Cameroon">Cameroon</option>
          <option value="Canada">Canada</option>
          <option value="Cape Verde">Cape Verde</option>
          <option value="Central African Republic">Central African Republic</option>
          <option value="Chad">Chad</option>
          <option value="Chile">Chile</option>
          <option value="China">China</option>
          <option value="Colombia">Colombia</option>
          <option value="Comoros">Comoros</option>
          <option value="Congo">Congo</option>
          <option value="Costa Rica">Costa Rica</option>
          <option value="Croatia">Croatia</option>
          <option value="Cuba">Cuba</option>
          <option value="Cyprus">Cyprus</option>
          <option value="Czech Republic">Czech Republic</option>
          <option value="Denmark">Denmark</option>
          <option value="Djibouti">Djibouti</option>
          <option value="Dominican Republic">Dominican Republic</option>
          <option value="Ecuador">Ecuador</option>
          <option value="Egypt">Egypt</option>
          <option value="El Salvador">El Salvador</option>
          <option value="Estonia">Estonia</option>
          <option value="Ethiopia">Ethiopia</option>
          <option value="Fiji">Fiji</option>
          <option value="Finland">Finland</option>
          <option value="France">France</option>
          <option value="Gabon">Gabon</option>
          <option value="Gambia">Gambia</option>
          <option value="Georgia">Georgia</option>
          <option value="Germany">Germany</option>
          <option value="Ghana">Ghana</option>
          <option value="Greece">Greece</option>
          <option value="Guatemala">Guatemala</option>
          <option value="Guinea">Guinea</option>
          <option value="Guyana">Guyana</option>
          <option value="Haiti">Haiti</option>
          <option value="Honduras">Honduras</option>
          <option value="Hungary">Hungary</option>
          <option value="Iceland">Iceland</option>
          <option value="India">India</option>
          <option value="Indonesia">Indonesia</option>
          <option value="Iran">Iran</option>
          <option value="Iraq">Iraq</option>
          <option value="Ireland">Ireland</option>
          <option value="Israel">Israel</option>
          <option value="Italy">Italy</option>
          <option value="Jamaica">Jamaica</option>
          <option value="Japan">Japan</option>
          <option value="Jordan">Jordan</option>
          <option value="Kazakhstan">Kazakhstan</option>
          <option value="Kenya">Kenya</option>
          <option value="Kuwait">Kuwait</option>
          <option value="Kyrgyzstan">Kyrgyzstan</option>
          <option value="Laos">Laos</option>
          <option value="Latvia">Latvia</option>
          <option value="Lebanon">Lebanon</option>
          <option value="Lesotho">Lesotho</option>
          <option value="Liberia">Liberia</option>
          <option value="Libya">Libya</option>
          <option value="Lithuania">Lithuania</option>
          <option value="Luxembourg">Luxembourg</option>
          <option value="Madagascar">Madagascar</option>
          <option value="Malawi">Malawi</option>
          <option value="Malaysia">Malaysia</option>
          <option value="Maldives">Maldives</option>
          <option value="Mali">Mali</option>
          <option value="Malta">Malta</option>
          <option value="Mauritania">Mauritania</option>
          <option value="Mauritius">Mauritius</option>
          <option value="Mexico">Mexico</option>
          <option value="Moldova">Moldova</option>
          <option value="Monaco">Monaco</option>
          <option value="Mongolia">Mongolia</option>
          <option value="Montenegro">Montenegro</option>
          <option value="Morocco">Morocco</option>
          <option value="Mozambique">Mozambique</option>
          <option value="Myanmar">Myanmar</option>
          <option value="Namibia">Namibia</option>
          <option value="Nepal">Nepal</option>
          <option value="Netherlands">Netherlands</option>
          <option value="New Zealand">New Zealand</option>
          <option value="Nicaragua">Nicaragua</option>
          <option value="Niger">Niger</option>
          <option value="Nigeria">Nigeria</option>
          <option value="North Korea">North Korea</option>
          <option value="North Macedonia">North Macedonia</option>
          <option value="Norway">Norway</option>
          <option value="Oman">Oman</option>
          <option value="Pakistan">Pakistan</option>
          <option value="Panama">Panama</option>
          <option value="Papua New Guinea">Papua New Guinea</option>
          <option value="Paraguay">Paraguay</option>
          <option value="Peru">Peru</option>
          <option value="Philippines">Philippines</option>
          <option value="Poland">Poland</option>
          <option value="Portugal">Portugal</option>
          <option value="Qatar">Qatar</option>
          <option value="Romania">Romania</option>
          <option value="Russia">Russia</option>
          <option value="Rwanda">Rwanda</option>
          <option value="Saudi Arabia">Saudi Arabia</option>
          <option value="Senegal">Senegal</option>
          <option value="Serbia">Serbia</option>
          <option value="Sierra Leone">Sierra Leone</option>
          <option value="Singapore">Singapore</option>
          <option value="Slovakia">Slovakia</option>
          <option value="Slovenia">Slovenia</option>
          <option value="Somalia">Somalia</option>
          <option value="South Africa">South Africa</option>
          <option value="South Korea">South Korea</option>
          <option value="South Sudan">South Sudan</option>
          <option value="Spain">Spain</option>
          <option value="Sri Lanka">Sri Lanka</option>
          <option value="Sudan">Sudan</option>
          <option value="Suriname">Suriname</option>
          <option value="Sweden">Sweden</option>
          <option value="Switzerland">Switzerland</option>
          <option value="Syria">Syria</option>
          <option value="Taiwan">Taiwan</option>
          <option value="Tajikistan">Tajikistan</option>
          <option value="Tanzania">Tanzania</option>
          <option value="Thailand">Thailand</option>
          <option value="Togo">Togo</option>
          <option value="Trinidad and Tobago">Trinidad and Tobago</option>
          <option value="Tunisia">Tunisia</option>
          <option value="Turkey">Turkey</option>
          <option value="Turkmenistan">Turkmenistan</option>
          <option value="Uganda">Uganda</option>
          <option value="Ukraine">Ukraine</option>
          <option value="United Arab Emirates">United Arab Emirates</option>
          <option value="United Kingdom">United Kingdom</option>
          <option value="United States">United States</option>
          <option value="Uruguay">Uruguay</option>
          <option value="Uzbekistan">Uzbekistan</option>
          <option value="Venezuela">Venezuela</option>
          <option value="Vietnam">Vietnam</option>
          <option value="Yemen">Yemen</option>
          <option value="Zambia">Zambia</option>
          <option value="Zimbabwe">Zimbabwe</option>`;
        openModal(`
          <h3 style="margin-top:10px">Download resource</h3>
          <p style="color:var(--c-text-soft);margin-top:6px">Leave your business email and our team will send the file within 12 hours.</p>
          <form id="downloadForm" class="form-grid" style="margin-top:18px">
            <div class="field"><label>Full name *</label><input name="name" required placeholder="Your name"></div>
            <div class="field"><label>Company</label><input name="company" placeholder="Company name"></div>
            <div class="field field--full"><label>Business email *</label><input type="email" name="email" required placeholder="name@company.com"></div>
            <div class="field field--full"><label>Country *</label><select name="country" required style="width:100%;padding:10px;border:1px solid var(--c-border);border-radius:var(--radius-sm);font-size:14px;background:#fff">${countryOpts}</select></div>
            <input type="hidden" name="document" value="${docTitle}">
            <button class="btn btn--primary form-submit" type="submit">Request download</button>
          </form>
        `);
        
        // 绑定下载表单提交
        document.getElementById('downloadForm').addEventListener('submit', async (e) => {
          e.preventDefault();
          const submitBtn = e.target.querySelector('button[type="submit"]');
          const originalText = submitBtn.textContent;
          
          const formData = {
            name: e.target.querySelector('[name="name"]').value,
            email: e.target.querySelector('[name="email"]').value,
            company: e.target.querySelector('[name="company"]').value || '未填写',
            country: e.target.querySelector('[name="country"]').value,
            document: e.target.querySelector('[name="document"]').value
          };

          submitBtn.textContent = '提交中...';
          submitBtn.disabled = true;

          try {
            const response = await fetch('/api/download-request', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (result.success) {
              alert(result.message);
              document.getElementById('aqModal').classList.remove('is-open');
            } else {
              alert('提交失败: ' + result.message);
            }
          } catch (error) {
            console.error('提交失败:', error);
            alert('网络错误，请稍后重试或直接发送邮件至 848835870@qq.com');
          } finally {
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
          }
        });
      }
    });
  }

  /* ========== FAQ accordion ========== */
  document.querySelectorAll(".faq-q").forEach(q=>{
    q.addEventListener("click",()=> q.parentElement.classList.toggle("is-open"));
  });

  /* ========== Product detail gallery / tabs ========== */
  const thumbs = document.querySelectorAll(".pd-thumbs button");
  if(thumbs.length){
    thumbs.forEach(t=> t.addEventListener("click",()=>{
      thumbs.forEach(x=> x.classList.remove("is-active"));
      t.classList.add("is-active");
      document.querySelector(".pd-main img").src = t.querySelector("img").src;
    }));
  }
  const tabBtns = document.querySelectorAll(".pd-tabs button");
  if(tabBtns.length){
    tabBtns.forEach((b,i)=> b.addEventListener("click",()=>{
      tabBtns.forEach(x=> x.classList.remove("is-active"));
      b.classList.add("is-active");
      document.querySelectorAll(".tab-panel").forEach((p,idx)=> p.classList.toggle("is-open",idx===i));
    }));
  }

  /* ========== Product detail: render from query ========== */
  const pdRoot = document.getElementById("productDetailRoot");
  if(pdRoot){
    const id = new URLSearchParams(location.search).get("id") || "ap-sh-800";
    const p = window.AQUA.products.find(x=> x.id===id) || window.AQUA.products[0];
    document.title = `${p.name} — XINPUREAO Shower Filter Manufacturer`;
    const metak = document.querySelector('meta[name="keywords"]');
    if(metak) metak.setAttribute("content",[p.name,"shower filter manufacturer","filtered shower head","private label shower filter","OEM shower filter"].join(", "));
    pdRoot.innerHTML = `
      <div class="pd-wrap">
        <div class="pd-gallery">
          <div class="pd-main"><img src="https://images.unsplash.com/photo-1595514535215-9a5e5e03ae01?auto=format&fit=crop&w=1000&q=80" alt="${p.name}"></div>
          <div class="pd-thumbs">
            <button class="is-active"><img src="https://images.unsplash.com/photo-1595514535215-9a5e5e03ae01?auto=format&fit=crop&w=400&q=70" alt=""></button>
            <button><img src="https://images.unsplash.com/photo-1582735686119-1399-48f10a88?auto=format&fit=crop&w=400&q=70" alt=""></button>
            <button><img src="https://images.unsplash.com/photo-1584622631098-30a895692785?auto=format&fit=crop&w=400&q=70" alt=""></button>
            <button><img src="https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=400&q=70" alt=""></button>
          </div>
        </div>
        <div class="pd-info">
          <div class="eyebrow">${p.tag||"Featured product"}</div>
          <h1>${p.name}</h1>
          <div class="pd-sku">SKU: ${p.sku} · Category: ${p.category.replace(/-/g," ")}</div>
          <p>${p.short}</p>
          <div class="pd-price"><b>${p.price}</b><span>EXW factory price · MOQ ${p.moq} pcs</span></div>
          <ul class="pd-highlights">${(p.highlights||[]).map(h=>`<li>${h}</li>`).join("")}</ul>
          <div class="pd-cta">
            <a class="btn btn--primary" href="contact.html">Get a quote</a>
            <a class="btn btn--accent" href="#" onclick="openContactModal('${p.sku}');return false">Request sample</a>
            <a class="btn btn--outline" href="whatsapp://send?phone=8618452930159">WhatsApp: +86 18452930159</a>
          </div>
        </div>
      </div>

      <div class="pd-tabs" style="margin-top:60px">
        <button class="is-active">Technical Specs</button>
        <button>Materials & Media</button>
        <button>Installation</button>
        <button>Applications</button>
        <button>FAQ</button>
      </div>

      <div class="tab-panel is-open">
        <table class="spec-table">
          ${Object.entries(p.specs||{}).map(([k,v])=>`<tr><th>${k}</th><td>${v}</td></tr>`).join("")}
        </table>
      </div>

      <div class="tab-panel">
        <div class="two-col" style="gap:40px">
          <div class="col-img"><img src="https://images.unsplash.com/photo-1584622631098-30a895692785?auto=format&fit=crop&w=900&q=70" alt="Media materials"></div>
          <div>
            <div class="eyebrow">Media composition</div>
            <h2 style="margin-bottom:16px">Food-grade, proven media</h2>
            <p>All XINPUREAO media cartridges use only BPA-free, food-contact-safe materials. Each batch is SGS-tested for heavy metal leaching and bacterial colonization before release.</p>
            <ul class="pd-highlights">
              <li>KDF 55 — removes chlorine, lead, mercury, inhibits bacteria</li>
              <li>Calcium sulfite — instant de-chlorination in hot water</li>
              <li>Activated carbon — removes VOCs and odors</li>
              <li>Mineral ceramic balls — anti-scale, pH balance</li>
              <li>Vitamin C cartridge (optional) — neutralizes chloramine</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="tab-panel">
        <div class="two-col">
          <div>
            <div class="eyebrow">Installation</div>
            <h2 style="margin-bottom:16px">5-minute tool-free installation</h2>
            <p>Standard G1/2 thread fits 99% of shower arms in the US, EU, AU, and APAC markets. No plumber required.</p>
            <ol class="pd-highlights" style="list-style:decimal;padding-left:0">
              <li style="display:flex;align-items:flex-start;gap:10px">Unscrew the existing shower head by hand.</li>
              <li style="display:flex;align-items:flex-start;gap:10px">Wrap the Teflon tape (included) clockwise around the thread.</li>
              <li style="display:flex;align-items:flex-start;gap:10px">Screw the filter housing onto the shower arm until hand-tight.</li>
              <li style="display:flex;align-items:flex-start;gap:10px">Screw your existing shower head onto the filter outlet.</li>
              <li style="display:flex;align-items:flex-start;gap:10px">Open the water for 30 seconds to flush the new cartridge.</li>
            </ol>
          </div>
          <div class="col-img"><img src="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=900&q=70" alt="Installation"></div>
        </div>
      </div>

      <div class="tab-panel">
        <div class="cats" style="grid-template-columns:repeat(3,1fr)">
          <div class="cat-card"><div class="cat-icon">🏠</div><h4>Residential Homes</h4><p>Healthy shower water for every family member.</p></div>
          <div class="cat-card"><div class="cat-icon">🏨</div><h4>Hotels & Hospitality</h4><p>Luxury SPA-grade shower experience for premium hotels.</p></div>
          <div class="cat-card"><div class="cat-icon">🏢</div><h4>Apartments & Rentals</h4><p>No-tool installation, move-out friendly.</p></div>
          <div class="cat-card"><div class="cat-icon">💆</div><h4>SPA & Beauty Salons</h4><p>Soft, chloramine-free water for hair and skin treatments.</p></div>
          <div class="cat-card"><div class="cat-icon">💪</div><h4>Gyms & Fitness</h4><p>High-pressure, chlorine-free showers in locker rooms.</p></div>
          <div class="cat-card"><div class="cat-icon">🏫</div><h4>Schools & Public Buildings</h4><p>Bulk supply with cartridge replacement program.</p></div>
        </div>
      </div>

      <div class="tab-panel">
        <div class="faq">
          ${[
            {q:"What is the typical MOQ for custom orders?",a:"For stock models, MOQ starts at 100 pcs. For fully customized housings (new tooling), we recommend 500 pcs per SKU. First-time clients can request a lower trial MOQ after discussion."},
            {q:"How long is the lead time for OEM orders?",a:"Standard production runs take 25–35 days after sample approval and deposit. Tooling adds 2–3 weeks. Express production (for repeat clients) is available within 15 days."},
            {q:"Which certifications do you provide?",a:"All products comply with CE, RoHS, and FDA contact-safety standards. We also provide SGS and third-party lab test reports on request for each batch."},
            {q:"Can you ship to Amazon FBA warehouses?",a:"Yes. We ship regularly to Amazon FBA in the US, UK, Germany, France, Italy, Spain, Canada, Mexico, Australia, and Japan. We can provide prep, labeling, and DDP services."},
            {q:"What is the warranty on the filter housing and the cartridge?",a:"The filter housing carries a 2-year warranty against manufacturing defects. Cartridges are consumables and are guaranteed for the rated gallon / month lifespan."},
            {q:"Do you provide private label and custom packaging?",a:"Yes. We offer full private label programs: custom logo, color, housing shape, retail box, blister packaging, and printed user manuals in over 15 languages."}
          ].map((f,i)=>`<div class="faq-item ${i===0?"is-open":""}"><div class="faq-q">${f.q}</div><div class="faq-a">${f.a}</div></div>`).join("")}
        </div>
      </div>
    `;
    // re-bind thumbs / tabs / FAQ after innerHTML
    document.querySelectorAll(".pd-thumbs button").forEach(t=> t.addEventListener("click",()=>{
      document.querySelectorAll(".pd-thumbs button").forEach(x=> x.classList.remove("is-active"));
      t.classList.add("is-active");
      document.querySelector(".pd-main img").src = t.querySelector("img").src;
    }));
    const btns = document.querySelectorAll(".pd-tabs button");
    btns.forEach((b,i)=> b.addEventListener("click",()=>{
      btns.forEach(x=> x.classList.remove("is-active"));
      b.classList.add("is-active");
      document.querySelectorAll(".tab-panel").forEach((p,idx)=> p.classList.toggle("is-open",idx===i));
    }));
    document.querySelectorAll(".faq-q").forEach(q=> q.addEventListener("click",()=> q.parentElement.classList.toggle("is-open")));
  }

  /* ========== Video modal ========== */
  document.querySelectorAll("[data-video]").forEach(el=> el.addEventListener("click",(e)=>{
    e.preventDefault();
    const src = el.dataset.video;
    openModal(`
      <h3 style="margin-top:10px">${el.dataset.title || "Video"}</h3>
      <p style="color:var(--c-text-soft);margin-top:6px">High-quality product demonstration / installation / lab testing.</p>
      <iframe src="${src}" allowfullscreen></iframe>
    `);
  }));

  /* ========== Contact form generic ========== */
  document.querySelectorAll("form[data-contact]").forEach(f=>{
    f.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const btn = f.querySelector('button[type="submit"]');
      const originalText = btn.textContent;
      
      // 收集表单数据
      const formData = {
        name: f.querySelector('[name="name"]')?.value || f.querySelector('input')?.value || '未填写',
        email: f.querySelector('[name="email"]')?.value || f.querySelector('input[type="email"]')?.value || '未填写',
        company: f.querySelector('[name="company"]')?.value || f.querySelector('select')?.value || '未填写',
        country: f.querySelector('[name="country"]')?.value || f.querySelector('input:last-of-type')?.value || '未填写',
        interest: f.querySelector('select')?.value || '一般询盘',
        message: f.querySelector('textarea')?.value || '客户通过询盘表单提交',
        type: '网站询盘'
      };

      // 显示加载状态
      btn.textContent = '提交中...';
      btn.disabled = true;

      try {
        const response = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (result.success) {
          alert(result.message);
          f.reset();
        } else {
          alert('提交失败: ' + result.message);
        }
      } catch (error) {
        console.error('提交失败:', error);
        alert('网络错误，请稍后重试或直接发送邮件至 848835870@qq.com');
      } finally {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    });
  });

  /* ========== Scratch Card Popup ========== */
  const scratchModal = document.getElementById("scratchCardModal");
  if(scratchModal && !localStorage.getItem("scratchDone")){
    setTimeout(()=> scratchModal.classList.add("flex"), 2000);
    
    const canvas = document.getElementById("scratchCanvas");
    const ctx = canvas.getContext("2d");
    const rewards = ["$15 OFF", "$25 OFF", "$35 OFF", "$50 OFF"];
    const randomReward = rewards[Math.floor(Math.random() * rewards.length)];
    document.getElementById("scratchReward").textContent = randomReward;
    
    ctx.fillStyle = "#cccccc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#999999";
    ctx.font = "bold 24px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SCRATCH ME!", canvas.width/2, canvas.height/2);
    
    let isScratching = false;
    
    function scratch(e){
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX || e.touches[0].clientX) - rect.left;
      const y = (e.clientY || e.touches[0].clientY) - rect.top;
      
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(x, y, 30, 0, Math.PI * 2);
      ctx.fill();
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let pixels = 0;
      for(let i = 0; i < imageData.data.length; i += 4){
        if(imageData.data[i] === 0) pixels++;
      }
      if(pixels > (imageData.data.length / 4) * 0.3){
        canvas.style.opacity = "0";
      }
    }
    
    canvas.addEventListener("mousedown", (e) => { isScratching = true; scratch(e); });
    canvas.addEventListener("mousemove", (e) => { if(isScratching) scratch(e); });
    canvas.addEventListener("mouseup", () => { isScratching = false; });
    canvas.addEventListener("mouseleave", () => { isScratching = false; });
    
    canvas.addEventListener("touchstart", (e) => { isScratching = true; scratch(e); });
    canvas.addEventListener("touchmove", (e) => { if(isScratching) scratch(e); });
    canvas.addEventListener("touchend", () => { isScratching = false; });
  }

  /* ========== Cookie banner ========== */
  const cookie = document.getElementById("cookieBanner");
  if(cookie && !localStorage.getItem("aquaCookieOK")){
    setTimeout(()=> cookie.classList.add("is-visible"), 1200);
    cookie.querySelector(".cookie-accept").addEventListener("click",()=>{
      localStorage.setItem("aquaCookieOK","1");
      cookie.classList.remove("is-visible");
    });
  }
});

/* ========== Helpers ========== */
function openModal(html){
  let m = document.getElementById("aqModal");
  if(!m){
    m = document.createElement("div");
    m.id="aqModal"; m.className="modal";
    m.innerHTML = `<div class="modal-box"><button class="modal-close" onclick="this.closest('.modal').classList.remove('is-open')">✕</button><div class="modal-body"></div></div>`;
    m.addEventListener("click",e=>{ if(e.target===m) m.classList.remove("is-open"); });
    document.body.appendChild(m);
  }
  m.querySelector(".modal-body").innerHTML = html;
  m.classList.add("is-open");
}
function openContactModal(sku){
  const countryOptions = `<option value="">Select your country</option>
    <option value="Afghanistan">Afghanistan</option>
    <option value="Albania">Albania</option>
    <option value="Algeria">Algeria</option>
    <option value="Andorra">Andorra</option>
    <option value="Angola">Angola</option>
    <option value="Argentina">Argentina</option>
    <option value="Armenia">Armenia</option>
    <option value="Australia">Australia</option>
    <option value="Austria">Austria</option>
    <option value="Azerbaijan">Azerbaijan</option>
    <option value="Bahamas">Bahamas</option>
    <option value="Bahrain">Bahrain</option>
    <option value="Bangladesh">Bangladesh</option>
    <option value="Belarus">Belarus</option>
    <option value="Belgium">Belgium</option>
    <option value="Belize">Belize</option>
    <option value="Benin">Benin</option>
    <option value="Bhutan">Bhutan</option>
    <option value="Bolivia">Bolivia</option>
    <option value="Bosnia and Herzegovina">Bosnia and Herzegovina</option>
    <option value="Botswana">Botswana</option>
    <option value="Brazil">Brazil</option>
    <option value="Brunei">Brunei</option>
    <option value="Bulgaria">Bulgaria</option>
    <option value="Burkina Faso">Burkina Faso</option>
    <option value="Burundi">Burundi</option>
    <option value="Cambodia">Cambodia</option>
    <option value="Cameroon">Cameroon</option>
    <option value="Canada">Canada</option>
    <option value="Cape Verde">Cape Verde</option>
    <option value="Central African Republic">Central African Republic</option>
    <option value="Chad">Chad</option>
    <option value="Chile">Chile</option>
    <option value="China">China</option>
    <option value="Colombia">Colombia</option>
    <option value="Comoros">Comoros</option>
    <option value="Congo">Congo</option>
    <option value="Costa Rica">Costa Rica</option>
    <option value="Croatia">Croatia</option>
    <option value="Cuba">Cuba</option>
    <option value="Cyprus">Cyprus</option>
    <option value="Czech Republic">Czech Republic</option>
    <option value="Denmark">Denmark</option>
    <option value="Djibouti">Djibouti</option>
    <option value="Dominican Republic">Dominican Republic</option>
    <option value="Ecuador">Ecuador</option>
    <option value="Egypt">Egypt</option>
    <option value="El Salvador">El Salvador</option>
    <option value="Estonia">Estonia</option>
    <option value="Ethiopia">Ethiopia</option>
    <option value="Fiji">Fiji</option>
    <option value="Finland">Finland</option>
    <option value="France">France</option>
    <option value="Gabon">Gabon</option>
    <option value="Gambia">Gambia</option>
    <option value="Georgia">Georgia</option>
    <option value="Germany">Germany</option>
    <option value="Ghana">Ghana</option>
    <option value="Greece">Greece</option>
    <option value="Guatemala">Guatemala</option>
    <option value="Guinea">Guinea</option>
    <option value="Guyana">Guyana</option>
    <option value="Haiti">Haiti</option>
    <option value="Honduras">Honduras</option>
    <option value="Hungary">Hungary</option>
    <option value="Iceland">Iceland</option>
    <option value="India">India</option>
    <option value="Indonesia">Indonesia</option>
    <option value="Iran">Iran</option>
    <option value="Iraq">Iraq</option>
    <option value="Ireland">Ireland</option>
    <option value="Israel">Israel</option>
    <option value="Italy">Italy</option>
    <option value="Jamaica">Jamaica</option>
    <option value="Japan">Japan</option>
    <option value="Jordan">Jordan</option>
    <option value="Kazakhstan">Kazakhstan</option>
    <option value="Kenya">Kenya</option>
    <option value="Kuwait">Kuwait</option>
    <option value="Kyrgyzstan">Kyrgyzstan</option>
    <option value="Laos">Laos</option>
    <option value="Latvia">Latvia</option>
    <option value="Lebanon">Lebanon</option>
    <option value="Lesotho">Lesotho</option>
    <option value="Liberia">Liberia</option>
    <option value="Libya">Libya</option>
    <option value="Lithuania">Lithuania</option>
    <option value="Luxembourg">Luxembourg</option>
    <option value="Madagascar">Madagascar</option>
    <option value="Malawi">Malawi</option>
    <option value="Malaysia">Malaysia</option>
    <option value="Maldives">Maldives</option>
    <option value="Mali">Mali</option>
    <option value="Malta">Malta</option>
    <option value="Mauritania">Mauritania</option>
    <option value="Mauritius">Mauritius</option>
    <option value="Mexico">Mexico</option>
    <option value="Moldova">Moldova</option>
    <option value="Monaco">Monaco</option>
    <option value="Mongolia">Mongolia</option>
    <option value="Montenegro">Montenegro</option>
    <option value="Morocco">Morocco</option>
    <option value="Mozambique">Mozambique</option>
    <option value="Myanmar">Myanmar</option>
    <option value="Namibia">Namibia</option>
    <option value="Nepal">Nepal</option>
    <option value="Netherlands">Netherlands</option>
    <option value="New Zealand">New Zealand</option>
    <option value="Nicaragua">Nicaragua</option>
    <option value="Niger">Niger</option>
    <option value="Nigeria">Nigeria</option>
    <option value="North Korea">North Korea</option>
    <option value="North Macedonia">North Macedonia</option>
    <option value="Norway">Norway</option>
    <option value="Oman">Oman</option>
    <option value="Pakistan">Pakistan</option>
    <option value="Panama">Panama</option>
    <option value="Papua New Guinea">Papua New Guinea</option>
    <option value="Paraguay">Paraguay</option>
    <option value="Peru">Peru</option>
    <option value="Philippines">Philippines</option>
    <option value="Poland">Poland</option>
    <option value="Portugal">Portugal</option>
    <option value="Qatar">Qatar</option>
    <option value="Romania">Romania</option>
    <option value="Russia">Russia</option>
    <option value="Rwanda">Rwanda</option>
    <option value="Saudi Arabia">Saudi Arabia</option>
    <option value="Senegal">Senegal</option>
    <option value="Serbia">Serbia</option>
    <option value="Sierra Leone">Sierra Leone</option>
    <option value="Singapore">Singapore</option>
    <option value="Slovakia">Slovakia</option>
    <option value="Slovenia">Slovenia</option>
    <option value="Somalia">Somalia</option>
    <option value="South Africa">South Africa</option>
    <option value="South Korea">South Korea</option>
    <option value="South Sudan">South Sudan</option>
    <option value="Spain">Spain</option>
    <option value="Sri Lanka">Sri Lanka</option>
    <option value="Sudan">Sudan</option>
    <option value="Suriname">Suriname</option>
    <option value="Sweden">Sweden</option>
    <option value="Switzerland">Switzerland</option>
    <option value="Syria">Syria</option>
    <option value="Taiwan">Taiwan</option>
    <option value="Tajikistan">Tajikistan</option>
    <option value="Tanzania">Tanzania</option>
    <option value="Thailand">Thailand</option>
    <option value="Togo">Togo</option>
    <option value="Trinidad and Tobago">Trinidad and Tobago</option>
    <option value="Tunisia">Tunisia</option>
    <option value="Turkey">Turkey</option>
    <option value="Turkmenistan">Turkmenistan</option>
    <option value="Uganda">Uganda</option>
    <option value="Ukraine">Ukraine</option>
    <option value="United Arab Emirates">United Arab Emirates</option>
    <option value="United Kingdom">United Kingdom</option>
    <option value="United States">United States</option>
    <option value="Uruguay">Uruguay</option>
    <option value="Uzbekistan">Uzbekistan</option>
    <option value="Venezuela">Venezuela</option>
    <option value="Vietnam">Vietnam</option>
    <option value="Yemen">Yemen</option>
    <option value="Zambia">Zambia</option>
    <option value="Zimbabwe">Zimbabwe</option>`;

  openModal(`
    <h3 style="margin-top:10px">Request sample / Quote</h3>
    <p style="color:var(--c-text-soft);margin-top:6px">${sku?`<strong>SKU: ${sku}</strong> · `:""}Our sales team will contact you within 12 hours.</p>
    <form id="contactModalForm" class="form-grid" style="margin-top:18px">
      <div class="field"><label>Name *</label><input name="name" required></div>
      <div class="field"><label>Company</label><input name="company"></div>
      <div class="field"><label>Email *</label><input type="email" name="email" required></div>
      <div class="field"><label>WhatsApp</label><input name="whatsapp" placeholder="Optional"></div>
      <div class="field field--full"><label>Country *</label><select name="country" required style="width:100%;padding:10px;border:1px solid var(--c-border);border-radius:var(--radius-sm);font-size:14px;background:#fff">${countryOptions}</select></div>
      <div class="field field--full"><label>Quantity</label><input name="quantity" placeholder="e.g. 500 pcs"></div>
      <div class="field field--full"><label>Message</label><textarea name="message" rows="4" placeholder="Tell us about your project, target market, and requirements."></textarea></div>
      <button class="btn btn--primary form-submit" type="submit">Send request</button>
    </form>
  `);
  
  // 绑定表单提交事件
  document.getElementById('contactModalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    
    const formData = {
      name: e.target.querySelector('[name="name"]').value,
      email: e.target.querySelector('[name="email"]').value,
      company: e.target.querySelector('[name="company"]').value || '未填写',
      country: e.target.querySelector('[name="country"]').value,
      interest: sku || '产品询盘',
      message: e.target.querySelector('[name="message"]').value || '客户通过在线询盘表单提交',
      type: '网站询盘'
    };

    btn.textContent = '提交中...';
    btn.disabled = true;

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (result.success) {
        alert(result.message);
        document.getElementById('aqModal').classList.remove('is-open');
      } else {
        alert('提交失败: ' + result.message);
      }
    } catch (error) {
      console.error('提交失败:', error);
      alert('网络错误，请稍后重试');
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  });
}

/* ========== Homepage Content Fill (from page-data.js) ========== */
function fillHomePageContent() {
  const d = window.AQUA?.pageData?.home;
  if (!d) return;
  const $ = (id) => document.getElementById(id);
  const setText = (id, val) => { const el = $(id); if (el && val != null) el.textContent = val; };
  const setHTML = (id, val) => { const el = $(id); if (el && val != null) el.innerHTML = val; };
  const setSrc = (id, val) => { const el = $(id); if (el && val) el.src = val; };
  const setHref = (id, val) => { const el = $(id); if (el && val) el.href = val; };
  const setAlt = (id, val) => { const el = $(id); if (el && val) el.alt = val; };

  // Hero
  setText('homeHeroEyebrow', d.hero?.eyebrow);
  setHTML('homeHeroTitle', d.hero?.title);
  setText('homeHeroSubtitle', d.hero?.subtitle);
  setText('homeHeroBtn', d.hero?.buttonText);
  setHref('homeHeroBtn', d.hero?.buttonLink);
  setSrc('homeHeroMobileImg1', d.hero?.mobileSlides?.[0]?.image);
  setAlt('homeHeroMobileImg1', d.hero?.mobileSlides?.[0]?.alt);
  setSrc('homeHeroMobileImg2', d.hero?.mobileSlides?.[1]?.image);
  setAlt('homeHeroMobileImg2', d.hero?.mobileSlides?.[1]?.alt);
  setSrc('homeHeroDesktopImg1', d.hero?.desktopSlides?.[0]?.image);
  setAlt('homeHeroDesktopImg1', d.hero?.desktopSlides?.[0]?.alt);
  setSrc('homeHeroDesktopImg2', d.hero?.desktopSlides?.[1]?.image);
  setAlt('homeHeroDesktopImg2', d.hero?.desktopSlides?.[1]?.alt);

  // About
  setText('homeAboutTitle', d.about?.title);
  setText('homeAboutSubtitle', d.about?.subtitle);
  setText('homeAboutP1', d.about?.paragraphs?.[0]);
  setText('homeAboutP2', d.about?.paragraphs?.[1]);
  const stats = d.about?.stats || [];
  for (let i = 0; i < 6; i++) {
    setText('homeAboutStat' + (i + 1) + 'Value', stats[i]?.value);
    setText('homeAboutStat' + (i + 1) + 'Label', stats[i]?.label);
  }
  setSrc('homeAboutImgMain', d.about?.imageMain);
  setAlt('homeAboutImgMain', d.about?.imageMainAlt);
  setSrc('homeAboutImgOverlay', d.about?.imageOverlay);
  setAlt('homeAboutImgOverlay', d.about?.imageOverlayAlt);
  setText('homeAboutBtn', d.about?.buttonText);
  setHref('homeAboutBtn', d.about?.buttonLink);

  // Testimonials
  setText('homeTestimonialsTitle', d.testimonials?.title);
  const items = d.testimonials?.items || [];
  for (let i = 0; i < 4; i++) {
    const it = items[i];
    setText('homeTest' + (i + 1) + 'Abbrev', it?.abbrev);
    setText('homeTest' + (i + 1) + 'Title', it?.title);
    setText('homeTest' + (i + 1) + 'Text', it?.text);
    setText('homeTest' + (i + 1) + 'Name', it?.name);
    setText('homeTest' + (i + 1) + 'Role', it?.role);
  }

  // OEM / ODM
  setText('homeOemEyebrow', d.oemSection?.eyebrow);
  setText('homeOemTitle', d.oemSection?.title);
  setText('homeOemSubtitle', d.oemSection?.subtitle);
  const cards = d.oemSection?.cards || [];
  for (let i = 0; i < 4; i++) {
    setSrc('homeOemImg' + (i + 1), cards[i]?.image);
    setText('homeOemCardTitle' + (i + 1), cards[i]?.title);
  }
  setText('homeOemBtn', d.oemSection?.buttonText);
  setHref('homeOemBtn', d.oemSection?.buttonLink);

  // Factory Showcase
  setText('homeFactoryTitle', d.factoryShowcase?.title);
  setText('homeFactoryBtn', d.factoryShowcase?.buttonText);
  setHref('homeFactoryBtn', d.factoryShowcase?.buttonLink);
  const carouselImgs = d.factoryShowcase?.carouselImages || [];
  for (let i = 0; i < 4; i++) {
    setSrc('homeFactoryCarouselImg' + (i + 1), carouselImgs[i]);
  }
  setSrc('homeFactoryVideoSrc', d.factoryShowcase?.videoSrc);
  setText('homeFactoryVideoTitle', d.factoryShowcase?.videoTitle);
  setText('homeFactoryVideoBtn', d.factoryShowcase?.videoButtonText);
  setHref('homeFactoryVideoBtn', d.factoryShowcase?.videoButtonLink);
  const certs = d.factoryShowcase?.certificates || [];
  for (let i = 0; i < 9; i++) {
    setSrc('homeCertImg' + (i + 1), certs[i]);
  }

  // Inquiry
  setText('homeInquiryEyebrow', d.inquirySection?.eyebrow);
  setText('homeInquiryTitle', d.inquirySection?.title);
  setText('homeInquiryFormLabel', d.inquirySection?.formLabel);
  setText('homeInquiryFormSubtext', d.inquirySection?.formSubtext);
}
fillHomePageContent();

