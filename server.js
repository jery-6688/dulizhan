/* XINPUREAO - Email Notification Server
 * 处理客户表单提交并发送邮件通知
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 80;
const SITE_DOMAIN = process.env.SITE_DOMAIN || 'xinpaezshower.com';

// Resend 邮件客户端（延迟初始化，启动不崩）
let resendClient = null;
function getResend() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    const { Resend } = require('resend');
    resendClient = new Resend(process.env.RESEND_API_KEY);
    console.log('✅ Resend 已初始化');
  }
  if (!process.env.RESEND_API_KEY) {
    console.log('⚠️ RESEND_API_KEY 环境变量未设置！');
  }
  return resendClient;
}

// 中间件
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.setHeader('X-XSS-Protection','1; mode=block');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  if(req.headers['x-forwarded-proto']==='https' || req.secure){
    res.setHeader('Strict-Transport-Security','max-age=63072000; includeSubDomains; preload');
  }
  next();
});
app.use((req,res,next)=>{
  if(/^\/data(?:\/|$)/i.test(req.path)) return res.status(403).type('text/plain').send('Forbidden');
  next();
});
app.use(cors());
app.use(express.json());
const loginLimit = new Map();
app.use('/api/admin/login', (req,res,next)=>{
  const ip = req.ip || req.socket.remoteAddress || '0.0.0.0';
  const now = Date.now();
  let e = loginLimit.get(ip);
  if(!e || now - e.first > 15*60*1000){ e = {count:0, first:now}; loginLimit.set(ip,e); }
  if(e.count >= 8){ res.set('Retry-After', 900); return res.status(429).json({success:false, message:'登录尝试过多，15 分钟后再试'}); }
  res.on('finish', ()=>{ if(res.statusCode === 401){ e.count++; loginLimit.set(ip,e); } });
  next();
});
// --- 服务端注入 header/footer/floating（SEO 友好）---
const partialsCache = {};
function loadPartial(name){
  if(partialsCache[name]) return partialsCache[name];
  const p = path.join(__dirname, 'partials', name);
  if(fs.existsSync(p)){
    partialsCache[name] = fs.readFileSync(p, 'utf8');
  }
  return partialsCache[name] || '';
}
// --- 工具：HTML 转义（用于占位符替换时安全输出文本） ---
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(s){ return String(s==null?'':s).replace(/"/g,'&quot;'); }
// 提供刷新接口（后台改 partials 后可清缓存，可选）
app.post('/api/admin/refresh-partials', (req, res) => {
  Object.keys(partialsCache).forEach(k => delete partialsCache[k]);
  res.json({ success: true });
});

// --- SEO Meta 生成 ---
const PAGE_KEY_MAP = {
  '': 'home', 'index.html': 'home', '/': 'home',
  'products.html': 'products',
  'product-detail.html': 'product-detail',
  'solutions.html': 'solutions',
  'OEM-ODM.html': 'oem',
  'about.html': 'about',
  'support.html': 'support',
  'downloads.html': 'downloads',
  'news.html': 'news', 'blog.html': 'news',
  'contact.html': 'contact',
  'factory.html': 'factory',
  'certifications.html': 'certifications'
};

function generateSEOMeta(urlPath, seo, req) {
  const g = seo.global || {};
  const pages = seo.pages || {};
  const products = readJSON('products.json') || [];
  const posts = readJSON('posts.json') || [];

  // 检测页面类型
  let pageKey = PAGE_KEY_MAP[urlPath] || '';
  let productSEO = null;
  let postSEO = null;
  let productObj = null;
  let postObj = null;

  // 产品详情页
  if (urlPath === '/product-detail.html') {
    const id = req.query.id || '';
    productObj = products.find(p => p.id === id);
    if (productObj && seo.products && seo.products[id]) {
      productSEO = seo.products[id];
    }
  }
  // 博客详情页
  if (urlPath === '/post-detail.html' || urlPath === '/news-detail.html') {
    const id = req.query.id || '';
    postObj = posts.find(p => p.id === id);
    if (postObj && seo.posts && seo.posts[id]) {
      postSEO = seo.posts[id];
    }
  }

  if (!pageKey && !productObj && !postObj) return '';

  // 获取该页面的 SEO 配置
  let ps = pageKey ? (pages[pageKey] || {}) : {};

  // 合并产品/博客级 SEO 覆盖
  let title, description, keyword, canonical;
  if (productObj) {
    title = (productSEO && productSEO.title) || productObj.name || '';
    description = (productSEO && productSEO.description) || (productObj.short || '').substring(0, 160);
    keyword = (productSEO && productSEO.keyword) || '';
  } else if (postObj) {
    title = (postSEO && postSEO.title) || postObj.title || '';
    description = (postSEO && postSEO.description) || postObj.excerpt || '';
    keyword = (postSEO && postSEO.keyword) || '';
  } else {
    title = ps.title || '';
    description = ps.description || '';
    keyword = ps.keyword || '';
    canonical = ps.canonical || '';
  }

  // 如果没有 title/description，返回空（使用 HTML 原有内容）
  if (!title && !description) return '';

  const sep = g.separator || ' | ';
  const siteTitle = g.siteTitle || 'XINPUREAO';
  const fullTitle = title ? (title + sep + siteTitle) : siteTitle;
  const siteUrl = (g.siteUrl || 'https://www.xinpaezshower.com').replace(/\/$/, '');

  // Canonical URL
  let canonicalUrl = canonical;
  if (!canonicalUrl) {
    canonicalUrl = siteUrl + urlPath;
    if (productObj) canonicalUrl += '?id=' + encodeURIComponent(productObj.id);
    if (postObj) canonicalUrl += '?id=' + encodeURIComponent(postObj.id);
  }

  // Index/Follow
  const robots = [];
  if (ps.noIndex || (productSEO && productSEO.noIndex) || (postSEO && postSEO.noIndex)) robots.push('noindex');
  if (ps.noFollow || (productSEO && productSEO.noFollow) || (postSEO && postSEO.noFollow)) robots.push('nofollow');
  const robotsMeta = robots.length ? robots.join(', ') : 'index, follow';

  // OG Image
  const ogImage = g.ogImage || '/images/og-image.webp';
  const ogImageUrl = ogImage.startsWith('http') ? ogImage : siteUrl + ogImage;

  // 构建 meta 标签
  const tags = [];
  tags.push('<!-- SEO Meta Tags Generated by XINPUREAO Admin -->');
  tags.push('<title>' + escapeHtml(fullTitle) + '</title>');
  if (description) tags.push('<meta name="description" content="' + escapeAttr(description) + '">');
  if (keyword) tags.push('<meta name="keywords" content="' + escapeAttr(keyword) + '">');
  tags.push('<meta name="robots" content="' + robotsMeta + '">');
  tags.push('<link rel="canonical" href="' + escapeAttr(canonicalUrl) + '">');

  // Open Graph
  tags.push('<meta property="og:type" content="' + (productObj ? 'product' : postObj ? 'article' : 'website') + '">');
  tags.push('<meta property="og:title" content="' + escapeAttr(fullTitle) + '">');
  if (description) tags.push('<meta property="og:description" content="' + escapeAttr(description) + '">');
  tags.push('<meta property="og:url" content="' + escapeAttr(canonicalUrl) + '">');
  tags.push('<meta property="og:site_name" content="' + escapeAttr(siteTitle) + '">');
  tags.push('<meta property="og:image" content="' + escapeAttr(ogImageUrl) + '">');

  // Twitter Card
  tags.push('<meta name="twitter:card" content="summary_large_image">');
  tags.push('<meta name="twitter:title" content="' + escapeAttr(fullTitle) + '">');
  if (description) tags.push('<meta name="twitter:description" content="' + escapeAttr(description) + '">');
  tags.push('<meta name="twitter:image" content="' + escapeAttr(ogImageUrl) + '">');
  if (g.twitterHandle) tags.push('<meta name="twitter:site" content="' + escapeAttr(g.twitterHandle) + '">');

  // 搜索引擎验证
  if (g.googleVerify) tags.push('<meta name="google-site-verification" content="' + escapeAttr(g.googleVerify) + '">');
  if (g.bingVerify) tags.push('<meta name="msvalidate.01" content="' + escapeAttr(g.bingVerify) + '">');
  if (g.baiduVerify) tags.push('<meta name="baidu-site-verification" content="' + escapeAttr(g.baiduVerify) + '">');

  // 结构化数据 - Product
  if (productObj) {
    const productImage = (productObj.colorImages && productObj.colorImages[Object.keys(productObj.colorImages)[0]] && productObj.colorImages[Object.keys(productObj.colorImages)[0]][0]) || productObj.image || '';
    const productSchema = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      'name': productObj.name || '',
      'image': productImage ? [siteUrl + productImage] : [],
      'description': (productObj.short || '').substring(0, 200),
      'sku': productObj.sku || productObj.id || '',
      'brand': { '@type': 'Brand', 'name': siteTitle },
      'url': canonicalUrl,
      'offers': {
        '@type': 'Offer',
        'priceCurrency': 'USD',
        'price': (productObj.price || '').replace(/[^0-9.]/g, '') || '0',
        'availability': 'https://schema.org/InStock',
        'url': canonicalUrl
      }
    };
    tags.push('<script type="application/ld+json">' + JSON.stringify(productSchema) + '</script>');
  }

  // 结构化数据 - Article
  if (postObj) {
    const articleSchema = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      'headline': postObj.title || '',
      'description': postObj.excerpt || '',
      'datePublished': postObj.date || '',
      'image': postObj.image ? siteUrl + postObj.image : '',
      'author': { '@type': 'Organization', 'name': siteTitle },
      'publisher': { '@type': 'Organization', 'name': siteTitle },
      'url': canonicalUrl
    };
    tags.push('<script type="application/ld+json">' + JSON.stringify(articleSchema) + '</script>');
  }

  // 面包屑结构化数据
  if (pageKey || productObj || postObj) {
    const crumbs = [{ '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': siteUrl + '/' }];
    if (productObj) {
      crumbs.push({ '@type': 'ListItem', 'position': 2, 'name': 'Products', 'item': siteUrl + '/products.html' });
      crumbs.push({ '@type': 'ListItem', 'position': 3, 'name': productObj.name || '', 'item': canonicalUrl });
    } else if (postObj) {
      crumbs.push({ '@type': 'ListItem', 'position': 2, 'name': 'Blog', 'item': siteUrl + '/news.html' });
      crumbs.push({ '@type': 'ListItem', 'position': 3, 'name': postObj.title || '', 'item': canonicalUrl });
    } else if (pageKey) {
      const labels = { products: 'Products', solutions: 'Solutions', oem: 'OEM', about: 'About', support: 'Support', downloads: 'Downloads', news: 'Blog', contact: 'Contact', factory: 'Factory', certifications: 'Certifications' };
      crumbs.push({ '@type': 'ListItem', 'position': 2, 'name': labels[pageKey] || pageKey, 'item': canonicalUrl });
    }
    const breadcrumbSchema = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': crumbs };
    tags.push('<script type="application/ld+json">' + JSON.stringify(breadcrumbSchema) + '</script>');
  }

  tags.push('<!-- /SEO Meta Tags -->');
  return tags.join('\n');
}

app.use((req, res, next) => {
  // 仅处理 HTML 请求，排除 admin.html 与 modo1/ 子目录
  const urlPath = req.path;
  if(!urlPath.endsWith('.html') && urlPath !== '/' && !urlPath.endsWith('/')) return next();
  let file = urlPath === '/' || urlPath.endsWith('/') ? 'index.html' : urlPath.slice(1);
  if(file === 'admin.html' || file.startsWith('modo') || urlPath.startsWith('/modo')) return next();
  const filePath = path.join(__dirname, file);
  if(!fs.existsSync(filePath)) return next();
  let html = fs.readFileSync(filePath, 'utf8');
  const header = loadPartial('header.html');
  const footer = loadPartial('footer.html');
  const floating = loadPartial('floating.html');
  // 与原 main.js outerHTML 行为一致：占位 div 整个替换为 partial 内容
  if(header) html = html.replace(/<div id="site-header"><\/div>/, header);
  if(footer) html = html.replace(/<div id="site-footer"><\/div>/, footer);
  if(floating) html = html.replace(/<div id="site-floating-buttons"><\/div>/, floating);
  // 替换 partials 占位符（读 settings）
  const settings = readJSON('settings.json') || {};
  const footerSettings = settings.footer || {};
  // Logo
  const logoHtml = settings.headerLogo
    ? `<img src="${escapeAttr(settings.headerLogo)}" alt="XINPUREAO" style="width:300px;height:auto;">`
    : `<span class="font-extrabold text-primary text-4xl tracking-wide">XINPUREAO</span>`;
  html = html.replace('<!-- HEADER-LOGO-PLACEHOLDER -->', logoHtml);
  // Footer 公司简介
  html = html.replace('<!-- FOOTER-COMPANY-INTRO -->', escapeHtml(footerSettings.companyIntro));
  // Footer 社媒
  const social = settings.social || {};
  const socialHtml = [
    {url: social.tiktok, label:'TikTok', svg:'<svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>'},
    {url: social.facebook, label:'Facebook', svg:'<svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M9.1 21v-7.5H6.6V10h2.5V7.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2 .1 2.3.1v2.6h-1.6c-1.2 0-1.5.6-1.5 1.4V10h3l-.4 3.5h-2.6V21"/></svg>'},
    {url: social.instagram, label:'Instagram', svg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>'}
  ].filter(s => s.url).map(s => `<a href="${escapeAttr(s.url)}" target="_blank" class="w-10 h-10 rounded-full bg-[#1b3558] flex items-center justify-center text-white text-base hover:bg-accent transition-colors" title="${s.label}">${s.svg}</a>`).join('\n          ');
  html = html.replace('<!-- FOOTER-SOCIAL -->', socialHtml);
  // Footer 产品链接
  const productLinksHtml = (footerSettings.productLinks||[]).map(l => `<a href="${escapeAttr(l.href)}" class="block py-1.5 text-sm text-[#9fb2c9] hover:text-white transition-colors">${escapeHtml(l.label)}</a>`).join('\n        ');
  html = html.replace('<!-- FOOTER-PRODUCT-LINKS -->', productLinksHtml);
  // Footer 公司链接
  const companyLinksHtml = (footerSettings.companyLinks||[]).map(l => `<a href="${escapeAttr(l.href)}" class="block py-1.5 text-sm text-[#9fb2c9] hover:text-white transition-colors">${escapeHtml(l.label)}</a>`).join('\n        ');
  html = html.replace('<!-- FOOTER-COMPANY-LINKS -->', companyLinksHtml);
  // Footer 联系方式
  const contactItemsHtml = (footerSettings.contactItems||[]).map(l => {
    const inner = `<span class="text-accent mt-1">${escapeHtml(l.icon||'')}</span> <span>${l.href ? `<a href="${escapeAttr(l.href)}" class="hover:text-white">${escapeHtml(l.text)}</a>` : escapeHtml(l.text)}</span>`;
    return `<li class="flex items-start gap-2 text-sm text-[#9fb2c9]">${inner}</li>`;
  }).join('\n          ');
  html = html.replace('<!-- FOOTER-CONTACT-ITEMS -->', contactItemsHtml);
  // Footer 底部文字
  html = html.replace('<!-- FOOTER-BOTTOM-TEXT -->', escapeHtml(footerSettings.bottomText));
  html = html.replace('<!-- FOOTER-BOTTOM-LINKS -->', escapeHtml(footerSettings.bottomLinksText));
  const alibabaHtml = footerSettings.alibabaLink ? `<a href="${escapeAttr(footerSettings.alibabaLink)}" target="_blank" class="text-accent hover:text-white transition-colors">${escapeHtml(footerSettings.alibabaText)}</a>` : '';
  html = html.replace('<!-- FOOTER-ALIBABA -->', alibabaHtml);
  // --- SEO Meta 注入 ---
  const seo = readJSON('seo.json') || {};
  const seoMetaHtml = generateSEOMeta(urlPath, seo, req);
  if (seoMetaHtml) {
    // 先移除已有的 SEO 相关标签，再注入新的
    html = html.replace(/<title[^>]*>.*?<\/title>/i, '');
    html = html.replace(/<meta\s+name=["']description["'][^>]*>/gi, '');
    html = html.replace(/<meta\s+name=["']keywords["'][^>]*>/gi, '');
    html = html.replace(/<meta\s+name=["']robots["'][^>]*>/gi, '');
    html = html.replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '');
    html = html.replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, '');
    html = html.replace(/<meta\s+name=["']google-site-verification["'][^>]*>/gi, '');
    html = html.replace(/<meta\s+name=["']msvalidate\.01["'][^>]*>/gi, '');
    html = html.replace(/<meta\s+name=["']baidu-site-verification["'][^>]*>/gi, '');
    html = html.replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');
    html = html.replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>.*?<\/script>/gi, '');
    html = html.replace('</head>', seoMetaHtml + '\n</head>');
  }
  res.type('html').send(html);
});

app.use(express.static(path.join(__dirname)));

// 公司信息
const COMPANY_INFO = {
  name: 'XINPUREAO Water Purification Equipment Co., Ltd.',
  phone: '+86 18452930159',
  address: '江苏省徐州市铜山区安全谷B5-101室内',
  email: '848835870@qq.com'
};

// 邮件发送函数
async function sendNotificationEmail(formData) {
  const { name, email, company, country, interest, message, type, productName, phone } = formData;
  
  // 构建邮件内容
  const mailOptions = {
    from: '"XINPUREAO Website" <onboarding@resend.dev>',
    to: '848835870@qq.com',
    subject: `【新询盘】${productName ? '[' + productName + '] ' : ''}来自 ${name} - ${company || '未填写公司'}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0a4d8c, #23b7d8); padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🛁 XINPUREAO 新客户询盘</h1>
        </div>
        <div style="background: #f6f9fc; padding: 30px; border: 1px solid #e1e8ef;">
          <h2 style="color: #0a4d8c; margin-top: 0;">客户信息</h2>
          
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            ${productName ? `
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e1e8ef; font-weight: bold; width: 120px; background: #e8f4fd;">感兴趣产品</td>
              <td style="padding: 10px; border-bottom: 1px solid #e1e8ef; background: #e8f4fd;"><strong>${productName}</strong></td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e1e8ef; font-weight: bold; width: 120px;">客户姓名</td>
              <td style="padding: 10px; border-bottom: 1px solid #e1e8ef;">${name}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e1e8ef; font-weight: bold;">电子邮箱</td>
              <td style="padding: 10px; border-bottom: 1px solid #e1e8ef;"><a href="mailto:${email}">${email}</a></td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e1e8ef; font-weight: bold;">联系电话</td>
              <td style="padding: 10px; border-bottom: 1px solid #e1e8ef;">${phone || '未填写'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e1e8ef; font-weight: bold;">公司名称</td>
              <td style="padding: 10px; border-bottom: 1px solid #e1e8ef;">${company || '未填写'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e1e8ef; font-weight: bold;">所在国家</td>
              <td style="padding: 10px; border-bottom: 1px solid #e1e8ef;">${country || '未填写'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e1e8ef; font-weight: bold;">询盘类型</td>
              <td style="padding: 10px; border-bottom: 1px solid #e1e8ef;">${type || interest || '一般询盘'}</td>
            </tr>
          </table>
          
          <h2 style="color: #0a4d8c;">询盘内容</h2>
          <div style="background: white; padding: 20px; border-radius: 8px; border: 1px solid #e1e8ef;">
            ${message || '客户未填写详细信息'}
          </div>
          
          <div style="margin-top: 30px; padding: 20px; background: white; border-radius: 8px; border: 1px solid #e1e8ef;">
            <h3 style="color: #0a4d8c; margin-top: 0;">建议行动</h3>
            <ul style="color: #4e5d70;">
              <li>📧 <a href="mailto:${email}">回复客户邮箱</a></li>
              <li>📱 可尝试添加客户微信/WhatsApp进一步沟通</li>
              <li>⏰ 建议在12小时内回复</li>
            </ul>
          </div>
        </div>
        <div style="background: #061a33; color: #b9cee4; padding: 15px; text-align: center; border-radius: 0 0 8px 8px;">
          <p style="margin: 0; font-size: 12px;">
            此邮件由 XINPUREAO 网站自动发送<br>
            ${COMPANY_INFO.name}<br>
            电话: ${COMPANY_INFO.phone}
          </p>
        </div>
      </div>
    `,
    text: `
XINPUREAO 新客户询盘
${productName ? '感兴趣产品: ' + productName + '\n' : ''}
客户姓名: ${name}
电子邮箱: ${email}
联系电话: ${phone || '未填写'}
公司名称: ${company || '未填写'}
所在国家: ${country || '未填写'}
询盘类型: ${type || interest || '一般询盘'}

询盘内容:
${message || '客户未填写详细信息'}

---
${COMPANY_INFO.name}
电话: ${COMPANY_INFO.phone}
    `
  };

  try {
    await getResend()?.emails.send(mailOptions);
    console.log('✅ 邮件发送成功 - 收件人:', mailOptions.to);
    return { success: true, message: '邮件发送成功' };
  } catch (error) {
    console.error('❌ 邮件发送失败:', error);
    return { success: false, message: '邮件发送失败', error: error.message };
  }
}

// 订阅邮件通知函数
async function sendSubscribeEmail(email) {
  const mailOptions = {
    from: '"XINPUREAO Website" <onboarding@resend.dev>',
    to: '848835870@qq.com',
    subject: `【新订阅】${email} 订阅了 XINPUREAO 邮件通知`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #25d366, #128c7e); padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">📧 XINPUREAO 新邮件订阅</h1>
        </div>
        <div style="background: #f6f9fc; padding: 30px; border: 1px solid #e1e8ef;">
          <h2 style="color: #0a4d8c; margin-top: 0;">订阅信息</h2>
          
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e1e8ef; font-weight: bold; width: 120px;">订阅邮箱</td>
              <td style="padding: 10px; border-bottom: 1px solid #e1e8ef;"><a href="mailto:${email}">${email}</a></td>
            </tr>
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #e1e8ef; font-weight: bold;">订阅时间</td>
              <td style="padding: 10px; border-bottom: 1px solid #e1e8ef;">${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</td>
            </tr>
          </table>
          
          <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #e1e8ef;">
            <p style="margin: 0; color: #666; font-size: 14px;">
              该访客已订阅 XINPUREAO 网站的邮件通知服务。请通过邮件与客户联系，确认订阅需求。
            </p>
          </div>
        </div>
        <div style="background: #0a2a4d; padding: 15px; text-align: center;">
          <p style="color: #86b4d8; margin: 0; font-size: 12px;">
            此邮件由 XINPUREAO 网站自动发送 · XINPUREAO Water Purification Equipment Co., Ltd.
          </p>
        </div>
      </div>
    `
  };

  try {
    await getResend()?.emails.send(mailOptions);
    console.log('✅ 订阅邮件发送成功 - 收件人:', mailOptions.to);
    return { success: true, message: '邮件发送成功' };
  } catch (error) {
    console.error('❌ 订阅邮件发送失败:', error);
    return { success: false, message: '邮件发送失败', error: error.message };
  }
}

// API路由 - 邮件订阅
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ 
        success: false, 
        message: '请提供有效的邮箱地址' 
      });
    }

    console.log('📧 收到新订阅:', {
      email: email,
      time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    });

    // 立刻返回成功 + 后台异步发邮件
    res.json({ success: true, message: '订阅成功！感谢您的关注。' });
    sendSubscribeEmail(email).catch(err => {
      console.log('⚠️ 订阅邮件发送失败（后台）:', err.message);
    });
  } catch (error) {
    console.error('处理订阅失败:', error);
    res.status(500).json({ success: false, message: '服务器错误，请稍后重试。' });
  }
});

// API路由 - 处理询盘提交
app.post('/api/contact', async (req, res) => {
  try {
    const formData = req.body;
    
    console.log('📩 收到新询盘:', {
      name: formData.name,
      email: formData.email,
      company: formData.company,
      time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    });

    // 先保存统计 + 立刻返回成功给用户
    incrementInquiry();
    res.json({ 
      success: true, 
      message: '感谢您的询盘！我们将在12小时内回复您。'
    });

    // 后台异步发邮件（不阻塞响应）
    sendNotificationEmail(formData).catch(err => {
      console.log('⚠️ 邮件发送失败（后台）:', err.message);
    });
  } catch (error) {
    console.error('处理询盘失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器错误，请稍后重试。' 
    });
  }
});

// API路由 - 下载请求
app.post('/api/download-request', async (req, res) => {
  try {
    const formData = req.body;
    
    console.log('📥 收到下载请求:', {
      name: formData.name,
      email: formData.email,
      document: formData.document,
      time: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    });

    // 立刻返回成功 + 后台异步发邮件
    incrementDownload();
    res.json({ 
      success: true, 
      message: '请求已收到，我们将在12小时内发送文档到您的邮箱。' 
    });

    const mailOptions = {
      from: '"XINPUREAO Website" <onboarding@resend.dev>',
      to: '848835870@qq.com',
      subject: `【下载请求】${formData.name} 请求下载 ${formData.document}`,
      html: `
        <h2>下载请求通知</h2>
        <p><strong>姓名:</strong> ${formData.name}</p>
        <p><strong>邮箱:</strong> ${formData.email}</p>
        <p><strong>公司:</strong> ${formData.company || '未填写'}</p>
        <p><strong>国家:</strong> ${formData.country || '未填写'}</p>
        <p><strong>请求文档:</strong> ${formData.document}</p>
        <p><strong>时间:</strong> ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
      `
    };

    getResend()?.emails.send(mailOptions).catch(err => {
      console.log('⚠️ 下载请求邮件发送失败（后台）:', err.message);
    });
  } catch (error) {
    console.error('处理下载请求失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器错误，请稍后重试。' 
    });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ============================================================
// === CMS 后端扩展：JSON 持久化 + 鉴权 + CRUD + 上传 + 统计 ===
// ============================================================

const crypto = require('crypto');
const multer = require('multer');

const DATA_DIR = path.join(__dirname, 'data');
const PICTURES_DIR = path.join(__dirname, 'Pictures');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const SECRET_PATH = path.join(DATA_DIR, 'secret.json');
function ensureSecret(){
  if(fs.existsSync(SECRET_PATH)) return;
  fs.writeFileSync(SECRET_PATH, JSON.stringify({
    tokenSecret: crypto.randomBytes(32).toString('hex'),
    pepper: crypto.randomBytes(16).toString('hex')
  }));
}
function getSecret(){ return JSON.parse(fs.readFileSync(SECRET_PATH,'utf8')); }

const ITER = 200000;
const KEYLEN = 32;
const DIGEST = 'sha256';
function hashPassword(password){
  const { pepper } = getSecret();
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(password + pepper, salt, ITER, KEYLEN, DIGEST);
  return { salt, hash: derived.toString('hex'), iter: ITER, digest: DIGEST };
}
function verifyPassword(password, stored){
  const { pepper } = getSecret();
  const derived = crypto.pbkdf2Sync(password + pepper, stored.salt, stored.iter||ITER, KEYLEN, stored.digest||DIGEST);
  return crypto.timingSafeEqual(Buffer.from(derived.toString('hex'),'hex'), Buffer.from(stored.hash,'hex'));
}

function migrateAdminIfNeeded(){
  const a = readJSON('admin.json');
  if (!a) return;
  if (a.password && !a.auth){
    a.auth = hashPassword(a.password);
    delete a.password;
    a.sessions = [];
    writeJSON('admin.json', a);
  }
}

// --- 工具：读写 data/ 下 JSON ---
function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// --- 工具：title → kebab-case slug ---
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// --- 启动时若 data/*.json 缺失则从 assets/js/data.js 初始化 ---
function initializeDataIfMissing() {
  ensureSecret();
  const files = ['products.json', 'posts.json', 'categories.json', 'downloads.json', 'settings.json', 'analytics.json', 'admin.json'];
  if (files.every(f => fs.existsSync(path.join(DATA_DIR, f)))) return;

  const prevWindow = global.window;
  global.window = {};
  try {
    require('./assets/js/data.js');
  } catch (e) {
    console.error('⚠️  无法从 assets/js/data.js 初始化数据：', e.message);
  }
  const AQUA = (global.window && global.window.AQUA) || {};
  global.window = prevWindow;

  const defaultCover = 'https://images.unsplash.com/photo-1582735686119-1399-48f10a88?auto=format&fit=crop&w=900&q=70';

  const products = (AQUA.products || []).map(p => Object.assign({}, p, { status: p.status || 'published' }));

  const posts = (AQUA.posts || []).map((p, i) => ({
    id: `post-${i + 1}`,
    title: p.title || '',
    slug: slugify(p.title || `post-${i + 1}`),
    cat: p.cat || '',
    category: p.cat || '',
    date: p.date || '',
    excerpt: p.excerpt || '',
    cover: defaultCover,
    author: 'XINPUREAO Team',
    tags: [p.cat].filter(Boolean),
    content: `<p>${p.excerpt || ''}</p><p>Full article content coming soon.</p>`,
    status: 'published'
  }));

  const downloads = (AQUA.downloads || []).map((d, i) => Object.assign({ id: `dl-${i + 1}` }, d));
  const categories = AQUA.categories || [];

  const settings = {
    company: { name: 'XINPUREAO Water Purification Equipment Co., Ltd.', phone: '+86 18452930159', email: '848835870@qq.com', address: '江苏省徐州市铜山区安全谷B5-101室内', whatsapp: '8618452930159' },
    social: { tiktok: 'https://www.tiktok.com/@jjjie977?is_from_webapp=1&sender_device=pc', facebook: 'https://www.facebook.com/share/1SxjmyvB1M/', instagram: 'https://www.instagram.com/jj848835870/' },
    homeIntro: 'Premium shower water filtration manufacturer. OEM / private label partner for brands and distributors in 60+ countries.',
    aboutText: '<p>XINPUREAO is a premium shower water filtration manufacturer based in Xuzhou, China.</p>'
  };

  const analytics = { byPage: {}, daily: {}, dailyDetail: {}, byIP: {}, byProduct: {}, inquiries: 0, downloads: 0, dailyInquiries: {}, dailyDownloads: {} };
  const admin = { username: 'admin', auth: hashPassword('xinpaez2025'), sessions: [] };

  writeJSON('products.json', products);
  writeJSON('posts.json', posts);
  writeJSON('categories.json', categories);
  writeJSON('downloads.json', downloads);
  writeJSON('settings.json', settings);
  writeJSON('analytics.json', analytics);
  writeJSON('admin.json', admin);
  console.log('✅ data/*.json 已从 assets/js/data.js 初始化');
}

initializeDataIfMissing();
migrateAdminIfNeeded();

// --- 重新生成 assets/js/data.js（JSON 为数据源，data.js 自动生成） ---
function regenerateDataJs() {
  const products = readJSON('products.json') || [];
  const posts = readJSON('posts.json') || [];
  const downloads = readJSON('downloads.json') || [];
  const categories = readJSON('categories.json') || [];
  const settings = readJSON('settings.json') || {};
  const content = '/* XINPUREAO 站点数据 — 由后端 server.js 从 data/*.json 自动生成，请勿手动编辑 */\n' +
    'window.AQUA = window.AQUA || {};\n' +
    'window.AQUA.products = ' + JSON.stringify(products.filter(p => p.status !== 'draft'), null, 2) + ';\n' +
    'window.AQUA.posts = ' + JSON.stringify(posts.filter(p => p.status !== 'draft'), null, 2) + ';\n' +
    'window.AQUA.downloads = ' + JSON.stringify(downloads, null, 2) + ';\n' +
    'window.AQUA.categories = ' + JSON.stringify(categories, null, 2) + ';\n' +
    'window.AQUA.settings = ' + JSON.stringify(settings, null, 2) + ';\n';
  fs.writeFileSync(path.join(__dirname, 'assets', 'js', 'data.js'), content);
}

regenerateDataJs();

// --- 重新生成 assets/js/page-data.js（页面内容数据） ---
function regeneratePageDataJs() {
  const settings = readJSON('settings.json') || {};
  const pageNames = ['home','solutions','oem','about','support'];
  const pageData = {};
  pageNames.forEach(name => {
    pageData[name] = readJSON('pages/' + name + '.json') || {};
  });
  const content = '/* XINPUREAO 页面内容数据 — 由后端 server.js 自动生成，请勿手动编辑 */\n' +
    'window.AQUA = window.AQUA || {};\n' +
    'window.AQUA.pageData = ' + JSON.stringify(pageData, null, 2) + ';\n' +
    'window.AQUA.settings = ' + JSON.stringify(settings, null, 2) + ';\n';
  fs.writeFileSync(path.join(__dirname, 'assets', 'js', 'page-data.js'), content);
}

regeneratePageDataJs();

// --- 鉴权中间件 ---
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ success: false, message: '未登录' });
  const parts = token.split('.');
  if (parts.length !== 3) return res.status(401).json({ success: false, message: '未登录或会话已过期' });
  const [raw, expStr, sign] = parts;
  const exp = parseInt(expStr, 10);
  const now = Date.now();
  if (isNaN(exp) || exp <= now) return res.status(401).json({ success: false, message: '未登录或会话已过期' });
  const { tokenSecret } = getSecret();
  const expectedSign = crypto.createHmac('sha256', tokenSecret).update(raw + '.' + expStr).digest('hex');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sign, 'hex'), Buffer.from(expectedSign, 'hex'))) {
      return res.status(401).json({ success: false, message: '未登录或会话已过期' });
    }
  } catch (e) {
    return res.status(401).json({ success: false, message: '未登录或会话已过期' });
  }
  const admin = readJSON('admin.json');
  const session = admin && (admin.sessions || []).find(s => s.token === token && s.expiresAt > now);
  if (!session) return res.status(401).json({ success: false, message: '未登录或会话已过期' });
  req.adminToken = token;
  req.adminUser = admin.username;
  next();
}

// --- 登录验证码：key = 随机 sessionId（前端持有），value = { code, expiresAt, attempts, username } ---
const loginCodes = new Map();
const CODE_TTL = 5 * 60 * 1000;   // 5 分钟有效
const CODE_MAX_TRY = 5;            // 最多试 5 次
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of loginCodes) if (v.expiresAt < now) loginCodes.delete(k);
}, 60 * 1000).unref();

// --- 发送登录验证码（公开，需先校验账号密码） ---
app.post('/api/admin/login/send-code', (req, res) => {
  const { username, password } = req.body || {};
  const admin = readJSON('admin.json');
  // 先校验账号密码，错则返回 401（不暴露是用户名错还是密码错）
  if (!admin || username !== admin.username || !admin.auth || !verifyPassword(password, admin.auth)) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }
  // 限频：同一 username 60 秒内只能发一次
  for (const [, v] of loginCodes) {
    if (v.username === username && (Date.now() - (v.expiresAt - CODE_TTL)) < 60 * 1000) {
      return res.status(429).json({ success: false, message: '验证码发送过于频繁，请 60 秒后再试' });
    }
  }
  // 生成 6 位数字验证码
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const sessionId = crypto.randomBytes(16).toString('hex');
  loginCodes.set(sessionId, {
    code,
    expiresAt: Date.now() + CODE_TTL,
    attempts: 0,
    username
  });
  // 异步发邮件（不阻塞响应）
  const mailOptions = {
    from: '"XINPUREAO 后台" <onboarding@resend.dev>',
    to: '848835870@qq.com',
    subject: '【XINPUREAO 管理后台】登录验证码',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px;">
        <div style="background:#0a4d8c;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">🛁 XINPUREAO 管理后台登录验证码</h2>
        </div>
        <div style="background:#fff;padding:24px 20px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 16px;color:#475569;">您正在登录管理后台，验证码为：</p>
          <div style="text-align:center;font-size:36px;font-weight:bold;letter-spacing:8px;color:#0a4d8c;background:#eff6ff;padding:16px;border-radius:8px;margin:0 0 16px;">${code}</div>
          <p style="margin:0 0 8px;color:#64748b;font-size:13px;">⏱ 验证码 5 分钟内有效，请尽快输入。</p>
          <p style="margin:0;color:#64748b;font-size:13px;">🔒 若非本人操作，请忽略此邮件并检查账号安全。</p>
        </div>
        <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">XINPUREAO Water Purification Equipment Co., Ltd.</p>
      </div>`
  };
  getResend()?.emails.send(mailOptions).then(() => {
    console.log('[登录验证码] 已发送至 848835870@qq.com，code=' + code);
  }).catch(err => {
    console.error('[登录验证码] 发送失败:', err.message);
  });
  // 响应不暴露 code，只返回 sessionId 给前端
  res.json({ success: true, sessionId, message: '验证码已发送至管理员邮箱' });
});

// --- 登录（公开，需账号密码） ---
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  const admin = readJSON('admin.json');
  if (!admin || username !== admin.username || !admin.auth || !verifyPassword(password, admin.auth)) {
    return res.status(401).json({ success: false, message: '用户名或密码错误' });
  }
  // 发 token
  const { tokenSecret } = getSecret();
  const raw = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 7*24*3600*1000;
  const sign = crypto.createHmac('sha256', tokenSecret).update(raw + '.' + expiresAt).digest('hex');
  const token = raw + '.' + expiresAt + '.' + sign;
  admin.sessions = admin.sessions || [];
  admin.sessions.push({ token, expiresAt });
  writeJSON('admin.json', admin);
  res.json({ success: true, token });
});

// --- 保护 /api/admin/*（login / login/send-code 除外） ---
app.use('/api/admin', (req, res, next) => {
  if (req.method === 'POST' && (req.path === '/login' || req.path === '/login/send-code' || req.path === '/change-password')) return next();
  return requireAuth(req, res, next);
});

// --- 登出 / 校验 ---
app.post('/api/admin/logout', (req, res) => {
  const admin = readJSON('admin.json');
  const token = req.adminToken;
  admin.sessions = (admin.sessions || []).filter(s => s.token !== token);
  writeJSON('admin.json', admin);
  res.json({ success: true });
});

app.post('/api/admin/change-password', (req, res) => {
  const { username, oldPassword, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ success: false, message: '新密码长度至少 8 位' });
  }
  const admin = readJSON('admin.json');
  if (!admin || username !== admin.username || !admin.auth || !verifyPassword(oldPassword, admin.auth)) {
    return res.status(401).json({ success: false, message: '旧密码错误' });
  }
  admin.auth = hashPassword(newPassword);
  admin.sessions = [];
  writeJSON('admin.json', admin);
  res.json({ success: true, message: '密码已修改，请重新登录' });
});

app.get('/api/admin/auth', (req, res) => {
  res.json({ success: true, user: { username: req.adminUser } });
});

// --- 产品 CRUD ---
app.get('/api/admin/products', (req, res) => {
  res.json({ success: true, products: readJSON('products.json') || [] });
});

app.post('/api/admin/products', (req, res) => {
  const products = readJSON('products.json') || [];
  const product = (req.body && req.body.product) || {};
  if (!product.id) product.id = `P${Date.now()}`;
  if (!product.sku) product.sku = product.id;
  if (!product.status) product.status = 'published';
  products.push(product);
  writeJSON('products.json', products);
  regenerateDataJs();
  res.json({ success: true, product });
});

app.get('/api/admin/products/:id', (req, res) => {
  const products = readJSON('products.json') || [];
  const product = products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ success: false, message: '未找到产品' });
  res.json({ success: true, product });
});

app.put('/api/admin/products/:id', (req, res) => {
  const products = readJSON('products.json') || [];
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: '未找到产品' });
  const updated = Object.assign({}, (req.body && req.body.product) || {}, { id: req.params.id });
  products[idx] = updated;
  writeJSON('products.json', products);
  regenerateDataJs();
  res.json({ success: true, product: updated });
});

app.delete('/api/admin/products/:id', (req, res) => {
  let products = readJSON('products.json') || [];
  products = products.filter(p => p.id !== req.params.id);
  writeJSON('products.json', products);
  regenerateDataJs();
  res.json({ success: true });
});

// --- 博客 CRUD ---
app.get('/api/admin/posts', (req, res) => {
  res.json({ success: true, posts: readJSON('posts.json') || [] });
});

app.post('/api/admin/posts', (req, res) => {
  const posts = readJSON('posts.json') || [];
  const post = (req.body && req.body.post) || {};
  if (!post.id) post.id = `post-${Date.now()}`;
  if (!post.slug) post.slug = slugify(post.title || post.id);
  if (!post.status) post.status = 'published';
  posts.push(post);
  writeJSON('posts.json', posts);
  regenerateDataJs();
  res.json({ success: true, post });
});

app.get('/api/admin/posts/:id', (req, res) => {
  const posts = readJSON('posts.json') || [];
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ success: false, message: '未找到文章' });
  res.json({ success: true, post });
});

app.put('/api/admin/posts/:id', (req, res) => {
  const posts = readJSON('posts.json') || [];
  const idx = posts.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: '未找到文章' });
  const updated = Object.assign({}, (req.body && req.body.post) || {}, { id: req.params.id });
  if (!updated.slug) updated.slug = slugify(updated.title || req.params.id);
  posts[idx] = updated;
  writeJSON('posts.json', posts);
  regenerateDataJs();
  res.json({ success: true, post: updated });
});

app.delete('/api/admin/posts/:id', (req, res) => {
  let posts = readJSON('posts.json') || [];
  posts = posts.filter(p => p.id !== req.params.id);
  writeJSON('posts.json', posts);
  regenerateDataJs();
  res.json({ success: true });
});

// --- 分类 CRUD ---
app.get('/api/admin/categories', (req, res) => {
  res.json({ success: true, categories: readJSON('categories.json') || [] });
});

app.post('/api/admin/categories', (req, res) => {
  const categories = readJSON('categories.json') || [];
  const category = (req.body && req.body.category) || {};
  if (!category.id) category.id = `cat-${Date.now()}`;
  categories.push(category);
  writeJSON('categories.json', categories);
  regenerateDataJs();
  res.json({ success: true, category });
});

app.put('/api/admin/categories/:id', (req, res) => {
  const categories = readJSON('categories.json') || [];
  const idx = categories.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: '未找到分类' });
  const updated = Object.assign({}, (req.body && req.body.category) || {}, { id: req.params.id });
  categories[idx] = updated;
  writeJSON('categories.json', categories);
  regenerateDataJs();
  res.json({ success: true, category: updated });
});

app.delete('/api/admin/categories/:id', (req, res) => {
  let categories = readJSON('categories.json') || [];
  categories = categories.filter(c => c.id !== req.params.id);
  writeJSON('categories.json', categories);
  regenerateDataJs();
  res.json({ success: true });
});

// --- 下载 CRUD ---
app.get('/api/admin/downloads', (req, res) => {
  res.json({ success: true, downloads: readJSON('downloads.json') || [] });
});

app.post('/api/admin/downloads', (req, res) => {
  const downloads = readJSON('downloads.json') || [];
  const download = (req.body && req.body.download) || {};
  if (!download.id) download.id = `dl-${Date.now()}`;
  downloads.push(download);
  writeJSON('downloads.json', downloads);
  regenerateDataJs();
  res.json({ success: true, download });
});

app.put('/api/admin/downloads/:id', (req, res) => {
  const downloads = readJSON('downloads.json') || [];
  const idx = downloads.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: '未找到下载项' });
  const updated = Object.assign({}, (req.body && req.body.download) || {}, { id: req.params.id });
  downloads[idx] = updated;
  writeJSON('downloads.json', downloads);
  regenerateDataJs();
  res.json({ success: true, download: updated });
});

app.delete('/api/admin/downloads/:id', (req, res) => {
  let downloads = readJSON('downloads.json') || [];
  downloads = downloads.filter(d => d.id !== req.params.id);
  writeJSON('downloads.json', downloads);
  regenerateDataJs();
  res.json({ success: true });
});

// --- 站点设置 ---
app.get('/api/admin/settings', (req, res) => {
  res.json({ success: true, settings: readJSON('settings.json') || {} });
});

app.put('/api/admin/settings', (req, res) => {
  const settings = (req.body && req.body.settings) ? req.body.settings : (req.body || {});
  writeJSON('settings.json', settings);
  regenerateDataJs();
  regeneratePageDataJs();
  // 清 partials 缓存让占位符替换读到新 settings
  Object.keys(partialsCache).forEach(k => delete partialsCache[k]);
  res.json({ success: true, settings, message: '设置已保存' });
});

// --- 首页内容 ---
app.get('/api/admin/pages/home', (req, res) => {
  const data = readJSON('pages/home.json') || {};
  res.json({ success: true, page: 'home', data });
});
app.put('/api/admin/pages/home', (req, res) => {
  const data = (req.body && req.body.data) ? req.body.data : {};
  writeJSON('pages/home.json', data);
  regeneratePageDataJs();
  res.json({ success: true, message: '首页内容已保存' });
});

// --- 图片上传（multer 多文件，字段名 files，存入 Pictures/） ---
const ALLOW_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i;
const ALLOW_MIME = /^image\//;
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb)=> cb(null, path.join(__dirname,'Pictures')),
  filename: (req, file, cb)=>{
    const orig = file.originalname || 'img';
    let ext = (orig.split('.').pop()||'').toLowerCase();
    if(!/^(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(ext)) ext = 'img';
    const safe = crypto.randomBytes(8).toString('hex') + '.' + ext;
    cb(null, Date.now() + '-' + safe);
  }
});
const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 8 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb)=>{
    if(!ALLOW_EXT.test(file.originalname||'')) return cb(new Error('只允许图片文件（jpg/png/gif/webp/bmp/svg）'));
    if(!ALLOW_MIME.test(file.mimetype||'')) return cb(new Error('非法图片 MIME'));
    cb(null,true);
  }
});

app.post('/api/admin/upload', (req, res) => {
  const handler = upload.array('files', 20);
  handler(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message || '上传失败' });
    }
    const paths = (req.files || []).map(f => `Pictures/${f.filename}`);
    res.json({ success: true, paths });
  });
});

// --- 获取客户端真实 IP ---
function getClientIP(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (fwd) return fwd;
  return req.ip || req.connection?.remoteAddress || '127.0.0.1';
}

// --- 浏览量埋点（公开，无 auth） ---
app.post('/api/track', (req, res) => {
  const { path, productId, productName } = req.body || {};
  if (!path) return res.json({ success: true });
  const analytics = readJSON('analytics.json') || { byPage: {}, daily: {}, dailyDetail: {}, byIP: {}, byProduct: {} };
  const today = new Date().toISOString().slice(0, 10);
  const ip = getClientIP(req);

  analytics.byPage = analytics.byPage || {};
  analytics.daily = analytics.daily || {};
  analytics.dailyDetail = analytics.dailyDetail || {};
  analytics.byIP = analytics.byIP || {};
  analytics.byProduct = analytics.byProduct || {};

  // 基础统计
  analytics.byPage[path] = (analytics.byPage[path] || 0) + 1;
  analytics.daily[today] = (analytics.daily[today] || 0) + 1;

  // 每日明细
  const detail = analytics.dailyDetail[today] || { byPage: {}, byProduct: {}, byIP: {} };
  detail.byPage = detail.byPage || {};
  detail.byPage[path] = (detail.byPage[path] || 0) + 1;

  // IP 统计
  const ipInfo = analytics.byIP[ip] || { count: 0, firstVisit: new Date().toISOString(), lastVisit: new Date().toISOString(), lastPage: path };
  ipInfo.count = (ipInfo.count || 0) + 1;
  ipInfo.lastVisit = new Date().toISOString();
  ipInfo.lastPage = path;
  analytics.byIP[ip] = ipInfo;

  // 每日 IP 明细
  detail.byIP = detail.byIP || {};
  const dayIp = detail.byIP[ip] || { count: 0, lastPage: path };
  dayIp.count = (dayIp.count || 0) + 1;
  dayIp.lastPage = path;
  detail.byIP[ip] = dayIp;

  // 产品点击统计
  if (productId) {
    analytics.byProduct[productId] = analytics.byProduct[productId] || { count: 0, name: productName || productId };
    analytics.byProduct[productId].count = (analytics.byProduct[productId].count || 0) + 1;
    if (productName) analytics.byProduct[productId].name = productName;

    detail.byProduct = detail.byProduct || {};
    detail.byProduct[productId] = (detail.byProduct[productId] || 0) + 1;
  }

  analytics.dailyDetail[today] = detail;

  // 清理30天前的明细数据
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  Object.keys(analytics.dailyDetail).forEach(d => {
    if (d < cutoffStr) delete analytics.dailyDetail[d];
  });

  writeJSON('analytics.json', analytics);
  res.json({ success: true });
});

// --- 统计询盘/下载（内部调用） ---
function incrementInquiry() {
  const analytics = readJSON('analytics.json') || {};
  analytics.inquiries = (analytics.inquiries || 0) + 1;
  const today = new Date().toISOString().slice(0, 10);
  analytics.dailyInquiries = analytics.dailyInquiries || {};
  analytics.dailyInquiries[today] = (analytics.dailyInquiries[today] || 0) + 1;
  writeJSON('analytics.json', analytics);
}
function incrementDownload() {
  const analytics = readJSON('analytics.json') || {};
  analytics.downloads = (analytics.downloads || 0) + 1;
  const today = new Date().toISOString().slice(0, 10);
  analytics.dailyDownloads = analytics.dailyDownloads || {};
  analytics.dailyDownloads[today] = (analytics.dailyDownloads[today] || 0) + 1;
  writeJSON('analytics.json', analytics);
}

// --- 页面中文名称映射 ---
const PAGE_NAMES = {
  'index.html': '首页', 'products.html': '产品列表', 'product-detail.html': '产品详情',
  'solutions.html': '解决方案', 'oem-odm.html': 'OEM/ODM', 'about.html': '关于我们',
  'support.html': '客户支持', 'downloads.html': '下载中心', 'news.html': '博客/新闻',
  'contact.html': '联系我们', 'factory.html': '工厂展示', 'certifications.html': '资质认证',
  'post.html': '博客详情'
};

// --- 浏览量统计（鉴权） ---
app.get('/api/admin/analytics', (req, res) => {
  const analytics = readJSON('analytics.json') || { byPage: {}, daily: {}, byIP: {}, byProduct: {}, dailyInquiries: {}, dailyDownloads: {} };
  const byPage = Object.entries(analytics.byPage || {})
    .map(([p, count]) => ({ path: p, count, label: PAGE_NAMES[p] || p }))
    .sort((a, b) => b.count - a.count);
  const today = new Date();
  const daily = [];
  const dailyLabels = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    daily.push({ date: ds, count: (analytics.daily && analytics.daily[ds]) || 0 });
    dailyLabels.push(ds);
  }
  const total = Object.values(analytics.byPage || {}).reduce((a, b) => a + (b || 0), 0);

  // 产品排行
  const byProduct = Object.entries(analytics.byProduct || {})
    .map(([id, v]) => ({ id, count: v.count || 0, name: v.name || id }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // 访客列表（最近20个）
  const byIP = Object.entries(analytics.byIP || {})
    .map(([ip, v]) => ({ ip, count: v.count || 0, lastVisit: v.lastVisit, lastPage: v.lastPage, firstVisit: v.firstVisit }))
    .sort((a, b) => new Date(b.lastVisit) - new Date(a.lastVisit))
    .slice(0, 20);

  // 今日独立访客数
  const todayStr = today.toISOString().slice(0, 10);
  const todayDetail = analytics.dailyDetail && analytics.dailyDetail[todayStr];
  const todayUV = todayDetail && todayDetail.byIP ? Object.keys(todayDetail.byIP).length : 0;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const yDetail = analytics.dailyDetail && analytics.dailyDetail[yesterdayStr];
  const yesterdayUV = yDetail && yDetail.byIP ? Object.keys(yDetail.byIP).length : 0;

  // 环比计算
  const todayPV = (analytics.daily && analytics.daily[todayStr]) || 0;
  const yesterdayPV = (analytics.daily && analytics.daily[yesterdayStr]) || 0;
  const pvGrowth = yesterdayPV > 0 ? Math.round((todayPV - yesterdayPV) / yesterdayPV * 100) : (todayPV > 0 ? 100 : 0);
  const uvGrowth = yesterdayUV > 0 ? Math.round((todayUV - yesterdayUV) / yesterdayUV * 100) : (todayUV > 0 ? 100 : 0);

  // 近30天独立访客数（估算）
  let totalUV30 = 0;
  const seenIPs = new Set();
  Object.values(analytics.dailyDetail || {}).forEach(d => {
    if (d && d.byIP) Object.keys(d.byIP).forEach(ip => seenIPs.add(ip));
  });
  totalUV30 = seenIPs.size;

  // 询盘/下载统计
  const todayInquiries = (analytics.dailyInquiries && analytics.dailyInquiries[todayStr]) || 0;
  const yesterdayInquiries = (analytics.dailyInquiries && analytics.dailyInquiries[yesterdayStr]) || 0;
  const todayDownloads = (analytics.dailyDownloads && analytics.dailyDownloads[todayStr]) || 0;
  const yesterdayDownloads = (analytics.dailyDownloads && analytics.dailyDownloads[yesterdayStr]) || 0;
  const inquiriesGrowth = yesterdayInquiries > 0 ? Math.round((todayInquiries - yesterdayInquiries) / yesterdayInquiries * 100) : (todayInquiries > 0 ? 100 : 0);
  const downloadsGrowth = yesterdayDownloads > 0 ? Math.round((todayDownloads - yesterdayDownloads) / yesterdayDownloads * 100) : (todayDownloads > 0 ? 100 : 0);

  res.json({
    success: true, total, byPage, daily, dailyLabels,
    byProduct, byIP: byIP.slice(0, 50),
    todayPV, yesterdayPV, pvGrowth,
    todayUV, yesterdayUV, uvGrowth, totalUV30,
    inquiries: analytics.inquiries || 0,
    downloads: analytics.downloads || 0,
    todayInquiries, todayDownloads,
    inquiriesGrowth, downloadsGrowth
  });
});

// --- 单日详情查询 ---
app.get('/api/admin/analytics/date', (req, res) => {
  const date = req.query.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ success: false, message: '日期格式错误，应为 YYYY-MM-DD' });
  }
  const analytics = readJSON('analytics.json') || {};
  const detail = analytics.dailyDetail && analytics.dailyDetail[date];
  if (!detail) {
    return res.json({ success: true, date, pageViews: 0, uniqueVisitors: 0, byPage: [], byProduct: [], byIP: [], inquiries: 0, downloads: 0 });
  }
  const byPage = Object.entries(detail.byPage || {}).map(([p, c]) => ({ path: p, count: c, label: PAGE_NAMES[p] || p })).sort((a, b) => b.count - a.count);
  const byProduct = Object.entries(detail.byProduct || {}).map(([id, c]) => ({ id, count: c })).sort((a, b) => b.count - a.count);
  const byIP = Object.entries(detail.byIP || {}).map(([ip, v]) => ({ ip, count: v.count, lastPage: v.lastPage })).sort((a, b) => b.count - a.count);
  const pageViews = Object.values(detail.byPage || {}).reduce((a, b) => a + b, 0);
  const uniqueVisitors = Object.keys(detail.byIP || {}).length;
  const inquiries = (analytics.dailyInquiries && analytics.dailyInquiries[date]) || 0;
  const downloads = (analytics.dailyDownloads && analytics.dailyDownloads[date]) || 0;
  res.json({ success: true, date, pageViews, uniqueVisitors, byPage, byProduct, byIP, inquiries, downloads });
});

// --- CSV 数据导出 ---
app.get('/api/admin/analytics/export', (req, res) => {
  const analytics = readJSON('analytics.json') || {};
  const formatDate = d => d.replace(/T.*/, '').replace(/-/g, '/');
  const csvLines = ['日期,总访问量,独立访客数,询盘数,下载数'];

  const dates = Object.keys(analytics.daily || {}).sort();
  dates.forEach(date => {
    const detail = analytics.dailyDetail && analytics.dailyDetail[date];
    const uv = detail && detail.byIP ? Object.keys(detail.byIP).length : 0;
    const pv = analytics.daily[date] || 0;
    const inq = (analytics.dailyInquiries && analytics.dailyInquiries[date]) || 0;
    const dl = (analytics.dailyDownloads && analytics.dailyDownloads[date]) || 0;
    csvLines.push(`${date},${pv},${uv},${inq},${dl}`);
  });

  // 产品排行
  csvLines.push('', '产品排行,');
  csvLines.push('产品ID,产品名,访问次数');
  Object.entries(analytics.byProduct || {}).sort((a, b) => (b[1].count || 0) - (a[1].count || 0)).forEach(([id, v]) => {
    csvLines.push(`${id},${v.name || id},${v.count || 0}`);
  });

  // 页面排行
  csvLines.push('', '页面排行,');
  csvLines.push('页面,中文名称,访问次数');
  Object.entries(analytics.byPage || {}).sort((a, b) => b[1] - a[1]).forEach(([p, c]) => {
    csvLines.push(`${p},${PAGE_NAMES[p] || p},${c}`);
  });

  const csv = '\uFEFF' + csvLines.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=analytics-export.csv');
  res.send(csv);
});

// ============ SEO 管理 API ============

// 获取完整 SEO 配置
app.get('/api/admin/seo', (req, res) => {
  res.json({ success: true, seo: readJSON('seo.json') || {} });
});

// 更新全局 SEO 设置
app.put('/api/admin/seo/global', (req, res) => {
  const seo = readJSON('seo.json') || {};
  seo.global = (req.body && req.body.global) || {};
  writeJSON('seo.json', seo);
  res.json({ success: true, seo: seo.global });
});

// 更新页面 SEO
app.put('/api/admin/seo/pages/:key', (req, res) => {
  const seo = readJSON('seo.json') || {};
  if (!seo.pages) seo.pages = {};
  seo.pages[req.params.key] = (req.body && req.body.page) || {};
  writeJSON('seo.json', seo);
  res.json({ success: true });
});

// 更新产品 SEO
app.put('/api/admin/seo/products/:id', (req, res) => {
  const seo = readJSON('seo.json') || {};
  if (!seo.products) seo.products = {};
  seo.products[req.params.id] = (req.body && req.body.seo) || {};
  writeJSON('seo.json', seo);
  res.json({ success: true });
});

// 更新博客 SEO
app.put('/api/admin/seo/posts/:id', (req, res) => {
  const seo = readJSON('seo.json') || {};
  if (!seo.posts) seo.posts = {};
  seo.posts[req.params.id] = (req.body && req.body.seo) || {};
  writeJSON('seo.json', seo);
  res.json({ success: true });
});

// 更新 Robots.txt
app.put('/api/admin/seo/robots', (req, res) => {
  const seo = readJSON('seo.json') || {};
  seo.robots = (req.body && req.body.content) || '';
  writeJSON('seo.json', seo);
  res.json({ success: true });
});

// 重新生成 Sitemap
app.post('/api/admin/seo/regenerate-sitemap', (req, res) => {
  generateSitemap();
  res.json({ success: true, message: 'Sitemap 已生成' });
});

// --- Sitemap 生成 ---
function generateSitemap() {
  const seo = readJSON('seo.json') || {};
  const g = seo.global || {};
  const siteUrl = (g.siteUrl || 'https://www.xinpaezshower.com').replace(/\/$/, '');
  const products = readJSON('products.json') || [];
  const posts = readJSON('posts.json') || [];

  const staticPages = [
    '/', '/products.html', '/solutions.html', '/OEM-ODM.html',
    '/about.html', '/support.html', '/downloads.html', '/news.html',
    '/contact.html', '/factory.html', '/certifications.html'
  ];

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  staticPages.forEach(path => {
    xml += '  <url>\n';
    xml += '    <loc>' + siteUrl + path + '</loc>\n';
    xml += '    <changefreq>weekly</changefreq>\n';
    xml += '    <priority>' + (path === '/' ? '1.0' : '0.8') + '</priority>\n';
    xml += '  </url>\n';
  });

  products.forEach(p => {
    xml += '  <url>\n';
    xml += '    <loc>' + siteUrl + '/product-detail.html?id=' + encodeURIComponent(p.id) + '</loc>\n';
    xml += '    <changefreq>monthly</changefreq>\n';
    xml += '    <priority>0.7</priority>\n';
    xml += '  </url>\n';
  });

  posts.forEach(p => {
    xml += '  <url>\n';
    xml += '    <loc>' + siteUrl + '/news-detail.html?id=' + encodeURIComponent(p.id) + '</loc>\n';
    xml += '    <lastmod>' + (p.date || new Date().toISOString().slice(0, 10)) + '</lastmod>\n';
    xml += '    <changefreq>monthly</changefreq>\n';
    xml += '    <priority>0.6</priority>\n';
    xml += '  </url>\n';
  });

  xml += '</urlset>';

  const sitemapPath = path.join(__dirname, 'sitemap.xml');
  fs.writeFileSync(sitemapPath, xml, 'utf8');
}

// --- Robots.txt ---
app.get('/robots.txt', (req, res) => {
  const seo = readJSON('seo.json') || {};
  const content = seo.robots || 'User-agent: *\nAllow: /\nSitemap: https://www.xinpaezshower.com/sitemap.xml';
  res.type('text/plain').send(content);
});

// --- Sitemap.xml ---
app.get('/sitemap.xml', (req, res) => {
  const sitemapPath = path.join(__dirname, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) generateSitemap();
  res.type('application/xml').sendFile(sitemapPath);
});

// 启动服务器
generateSitemap();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🛁 XINPUREAO 邮件通知服务器已启动                        ║
║                                                           ║
║   本机访问: http://localhost:${PORT}                         ║
║   局域网访问: http://192.168.x.x:${PORT}                     ║
║   公司名称: ${COMPANY_INFO.name}                          ║
║   通知邮箱: ${COMPANY_INFO.email}                        ║
║                                                           ║
║   提交询盘: POST /api/contact                             ║
║   下载请求: POST /api/download-request                     ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
