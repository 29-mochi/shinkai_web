/* ============================================================
   深海ことづて局 公式サイト スクリプト
   構成:
   1. 共通ユーティリティ
   2. ローディング画面の制御
   3. ヒーローの登場アニメーション
   4. スクロール連動の背景色変化(浅い海→中層→深海)
   5. マリンスノー・光の粒(Canvas)
   6. 泡・クラゲ・魚の漂う演出(CSSアニメーション要素の自動生成)
   7. スクロールで要素がふわっと現れる演出(IntersectionObserver)
   8. キャラクターカルーセル
   ============================================================ */

/* すべての処理は、HTMLの読み込みが完了してから実行する。
   こうすることで「まだ存在しない要素を操作しようとしてエラーになる」事故を防げる */
document.addEventListener("DOMContentLoaded", () => {

  /* ---------- 1. 共通ユーティリティ ---------- */

  /* 数値を範囲内に収める関数。例: clamp(120, 0, 100) → 100 */
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /* start〜end の間を、割合 t(0〜1)に応じて線形補間する関数。
     例: lerp(0, 100, 0.5) → 50 */
  function lerp(start, end, t) {
    return start + (end - start) * t;
  }

  /* 16進数カラーコード("#26255f"など)を、赤緑青(RGB)の数値配列に変換する関数 */
  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    const bigint = parseInt(clean, 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  }

  /* 2つの色を割合 t で混ぜ合わせ、"rgb(r, g, b)" 形式の文字列にして返す関数 */
  function mixColors(hexA, hexB, t) {
    const a = hexToRgb(hexA);
    const b = hexToRgb(hexB);
    const r = Math.round(lerp(a[0], b[0], t));
    const g = Math.round(lerp(a[1], b[1], t));
    const bl = Math.round(lerp(a[2], b[2], t));
    return `rgb(${r}, ${g}, ${bl})`;
  }


  /* ---------- 2. ローディング画面の制御 ---------- */

  const loadingScreen = document.getElementById("loading-screen");
  const loadingTextEl = document.getElementById("loading-text");
  const loadingBubblesWrap = document.getElementById("loading-bubbles");

  /* ローディング中に数秒おきに切り替えるメッセージ一覧 */
  const loadingMessages = [
    "深海へ潜航中...",
    "郵便物を確認しています...",
    "海流を読んでいます...",
    "灯りを点けています..."
  ];
  let loadingMessageIndex = 0;

  /* 1.4秒ごとにメッセージを次のものへ切り替えるタイマー */
  const loadingMessageTimer = setInterval(() => {
    loadingMessageIndex = (loadingMessageIndex + 1) % loadingMessages.length;
    loadingTextEl.textContent = loadingMessages[loadingMessageIndex];
  }, 1400);

  /* ローディング画面の中だけで使う、上へ流れていく泡を生成する関数 */
  function spawnLoadingBubble() {
    const bubble = document.createElement("span");
    bubble.className = "bubble";

    /* 泡ごとにランダムな大きさ・横位置・速度・左右のブレを与え、単調にならないようにする */
    const size = Math.random() * 14 + 6; // 6px〜20px
    const left = Math.random() * 100; // 画面の左から0%〜100%の位置
    const duration = Math.random() * 2.5 + 2.5; // 2.5秒〜5秒かけて上昇
    const drift = (Math.random() - 0.5) * 60; // -30px〜30px、左右にゆらぐ量

    bubble.style.width = `${size}px`;
    bubble.style.height = `${size}px`;
    bubble.style.left = `${left}%`;
    bubble.style.setProperty("--drift", `${drift}px`);
    bubble.style.animationDuration = `${duration}s`;

    loadingBubblesWrap.appendChild(bubble);

    /* アニメーションが終わったら要素を削除し、DOMに要素が溜まり続けないようにする */
    setTimeout(() => bubble.remove(), duration * 1000);
  }

  /* 0.2秒ごとに新しい泡を1つ生成し続けるタイマー */
  const bubbleSpawnTimer = setInterval(spawnLoadingBubble, 200);

  /* ページの読み込みが完了したら(画像なども含めて)、少し余韻を置いてローディング画面を消す */
  window.addEventListener("load", () => {
    setTimeout(() => {
      loadingScreen.classList.add("is-hidden");
      clearInterval(loadingMessageTimer);
      clearInterval(bubbleSpawnTimer);

      /* ローディングが終わったタイミングでヒーローの登場アニメーションを開始する */
      startHeroIntro();
    }, 1600); // 1.6秒は最低限見せるための待ち時間(演出として印象づけるため)
  });


  /* ---------- 3. ヒーローの登場アニメーション ---------- */

  const heroLogo = document.getElementById("hero-logo");
  const heroCopy = document.getElementById("hero-copy");

  function startHeroIntro() {
    /* is-in クラスを付けると、CSS側で用意した画面上からの落下+バウンスが一度だけ発動する。
       animationは終了後も最終状態を維持(forwards)するため、以降スクロールしても固定表示になる */
    heroLogo.classList.add("is-in");
    heroCopy.classList.add("is-in");
  }


  /* ---------- 4. スクロール連動の背景色変化 ---------- */

  const oceanBackground = document.getElementById("ocean-background");

  /* ページ全体のスクロール可能な範囲のうち、どのあたりまでを
     「深海演出の対象」とするか(ここでは最初の85%とし、フッター付近は深海のまま固定) */
  const DEPTH_RANGE_RATIO = 0.85;

  function updateOceanDepth() {
    const scrollTop = window.scrollY;
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    const rawProgress = scrollHeight > 0 ? scrollTop / scrollHeight : 0;

    /* 0〜1の進行度を、DEPTH_RANGE_RATIOで割って少し早めに深海へ到達するよう調整 */
    const progress = clamp(rawProgress / DEPTH_RANGE_RATIO, 0, 1);

    /* 0〜0.5は「浅い海→中層」、0.5〜1は「中層→深海」の2段階でグラデーションを作る */
    let currentColor;
    if (progress < 0.5) {
      const t = progress / 0.5;
      currentColor = mixColors("#33aacb", "#154f8a", t);
    } else {
      const t = (progress - 0.5) / 0.5;
      currentColor = mixColors("#154f8a", "#26255f", t);
    }

    /* CSS変数 --bg-current を書き換えることで、背景グラデーションの起点色を更新する */
    oceanBackground.style.setProperty("background", `linear-gradient(180deg, ${currentColor} 0%, #26255f 140%)`);
  }

  /* scroll イベントは非常に高頻度で発火するため、requestAnimationFrame でまとめて処理し、
     余計な再計算・再描画を減らして軽量に保つ(パフォーマンス対策) */
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        updateOceanDepth();
        ticking = false;
      });
      ticking = true;
    }
  });
  updateOceanDepth(); // 初回表示時にも一度実行しておく


  /* ---------- 5. マリンスノー・光の粒(Canvas) ---------- */

  const canvas = document.getElementById("particle-canvas");
  const ctx = canvas.getContext("2d");
  let particles = [];

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  /* 粒子1つ分のデータを作る関数。マリンスノー(白い粒)と光の粒(発光する粒)を両方生成する */
  function createParticle() {
    const isLight = Math.random() < 0.15; // 15%の確率で「光の粒」、残りは「マリンスノー」
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: isLight ? Math.random() * 2.5 + 1.5 : Math.random() * 1.8 + 0.6,
      speedY: isLight ? Math.random() * 0.15 + 0.05 : Math.random() * 0.35 + 0.15,
      speedX: (Math.random() - 0.5) * 0.15,
      opacity: Math.random() * 0.5 + 0.2,
      isLight
    };
  }

  function initParticles() {
    resizeCanvas();
    const count = Math.floor((canvas.width * canvas.height) / 18000); // 画面の広さに応じて数を調整
    particles = Array.from({ length: clamp(count, 40, 140) }, createParticle);
  }

  function drawParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);

      if (p.isLight) {
        /* 光の粒はアクセントカラーでほんのり発光しているように描く */
        ctx.fillStyle = `rgba(33, 253, 253, ${p.opacity})`;
        ctx.shadowColor = "rgba(33, 253, 253, 0.8)";
        ctx.shadowBlur = 8;
      } else {
        /* マリンスノーは白っぽく、控えめに描く */
        ctx.fillStyle = `rgba(234, 246, 251, ${p.opacity})`;
        ctx.shadowBlur = 0;
      }
      ctx.fill();

      /* マリンスノーはゆっくり下へ、光の粒はゆっくり上へ、それぞれ違う方向に漂わせる */
      p.y += p.isLight ? -p.speedY : p.speedY;
      p.x += p.speedX;

      /* 画面外に出たら反対側から再登場させ、粒が尽きないようにする */
      if (p.y > canvas.height + 10) p.y = -10;
      if (p.y < -10) p.y = canvas.height + 10;
      if (p.x > canvas.width + 10) p.x = -10;
      if (p.x < -10) p.x = canvas.width + 10;
    });

    requestAnimationFrame(drawParticles);
  }

  initParticles();
  drawParticles();
  window.addEventListener("resize", initParticles);


  /* ---------- 6. 泡・クラゲ・魚の漂う演出 ---------- */

  const driftersWrap = document.getElementById("drifters");

  /* 絵文字を使い、CSSのみで簡易的な「漂う生き物・泡」を表現する
     (画像アセットを使わずに、絵本のようなポップな雰囲気を軽量に再現するため) */
  const drifterTypes = [
    { symbol: "・", size: 18, duration: 26 }, // 泡
    { symbol: "●", size: 26, duration: 34 }, // クラゲの代わりの揺れるモチーフ
    { symbol: "゜", size: 20, duration: 30 }, // 小さな魚
    { symbol: "〇", size: 22, duration: 32 }  // 小さな魚(別種)
  ];

  function spawnDrifter() {
    const type = drifterTypes[Math.floor(Math.random() * drifterTypes.length)];
    const el = document.createElement("span");
    el.className = "drift-item";
    el.textContent = type.symbol;

    const startY = Math.random() * 100; // 画面の高さに対して0%〜100%の位置からスタート
    const size = type.size + Math.random() * 10;
    const duration = type.duration + Math.random() * 10;

    el.style.fontSize = `${size}px`;
    el.style.top = `${startY}%`;
    el.style.left = "-40px"; // 画面外の左端からスタートし、右へゆっくり流れる

    /* インラインで @keyframes 相当の動きを作るため、CSS transition ではなく
       Web Animations API(要素.animate)を使い、右へゆっくり移動させながらフェードイン/アウトさせる */
    driftersWrap.appendChild(el);
    const animation = el.animate(
      [
        { transform: "translateX(0) translateY(0)", opacity: 0 },
        { opacity: 0.55, offset: 0.1 },
        { transform: `translateX(${window.innerWidth + 100}px) translateY(${(Math.random() - 0.5) * 120}px)`, opacity: 0 }
      ],
      { duration: duration * 1000, easing: "linear" }
    );

    /* アニメーションが終わったら要素を削除し、DOMを軽量に保つ */
    animation.onfinish = () => el.remove();
  }

  /* 2.2秒ごとに1体ずつ、漂う生き物・泡を追加していく */
  setInterval(spawnDrifter, 2200);
  /* 最初の数体は間隔を空けずまとめて出し、開いた瞬間から画面が寂しくならないようにする */
  for (let i = 0; i < 5; i++) {
    setTimeout(spawnDrifter, i * 400);
  }


  /* ---------- 7. スクロールで要素がふわっと現れる演出 ---------- */

  /* .reveal クラスを持つすべての要素を対象に、画面内へ入ったことを監視する */
  const revealTargets = document.querySelectorAll(".reveal");

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          /* 一度表示したら監視を解除し、無駄な再計算を防ぐ */
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 } // 要素の15%が画面に入った時点で発火させる
  );

  revealTargets.forEach((target) => revealObserver.observe(target));

  /* ---------- 8. ギャラリー ---------- */

  const gallery = document.getElementById("gallery-viewer");
  const galleryImage = document.getElementById("gallery-feature-image");
  const galleryCaption = document.getElementById("gallery-feature-caption");
  const galleryThumbs = Array.from(gallery.querySelectorAll(".gallery-thumb"));
  const galleryPrevBtn = document.getElementById("gallery-prev");
  const galleryNextBtn = document.getElementById("gallery-next");
  let currentGalleryImage = 0;

  function showGalleryImage(index) {
    currentGalleryImage = (index + galleryThumbs.length) % galleryThumbs.length;
    const activeThumb = galleryThumbs[currentGalleryImage];
    const caption = activeThumb.dataset.caption;

    galleryImage.src = activeThumb.querySelector("img").getAttribute("src");
    galleryImage.alt = caption;
    galleryCaption.textContent = caption;

    galleryThumbs.forEach((thumb, thumbIndex) => {
      const isActive = thumbIndex === currentGalleryImage;
      thumb.classList.toggle("is-active", isActive);
      thumb.setAttribute("aria-pressed", String(isActive));
    });
  }

  galleryThumbs.forEach((thumb, index) => {
    thumb.addEventListener("click", () => showGalleryImage(index));
  });
  galleryPrevBtn.addEventListener("click", () => showGalleryImage(currentGalleryImage - 1));
  galleryNextBtn.addEventListener("click", () => showGalleryImage(currentGalleryImage + 1));
  showGalleryImage(0);

  /* ---------- 9. キャラクターカルーセル ---------- */

  const carousel = document.getElementById("carousel");
  const slides = Array.from(carousel.querySelectorAll(".carousel-slide"));
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");
  const dotsWrap = document.getElementById("carousel-dots");
  let currentSlide = 0;

  /* スライドの数に合わせて、下部のドットインジケーターを動的に作成する */
  slides.forEach((_, index) => {
    const dot = document.createElement("span");
    dot.className = "dot" + (index === 0 ? " is-active" : "");
    dot.addEventListener("click", () => goToSlide(index));
    dotsWrap.appendChild(dot);
  });
  const dots = Array.from(dotsWrap.children);

  function goToSlide(index) {
    /* 配列の範囲を超えたら反対側へループさせる(最後の次は最初、最初の前は最後) */
    currentSlide = (index + slides.length) % slides.length;

    slides.forEach((slide, i) => {
      slide.classList.toggle("is-active", i === currentSlide);
      slide.setAttribute("aria-hidden", String(i !== currentSlide));
    });
    dots.forEach((dot, i) => {
      dot.classList.toggle("is-active", i === currentSlide);
    });

    /* 現在表示中のスライドが持つ data-color 属性の色を、カルーセルの背景に薄く反映させ、
       キャラクターごとに雰囲気が変わるようにする */
    const color = slides[currentSlide].dataset.color;
    const stage = carousel.querySelector(".carousel-stage");
    stage.style.background = `linear-gradient(160deg, ${color}22, rgba(255,255,255,0.06))`;
  }

  prevBtn.addEventListener("click", () => goToSlide(currentSlide - 1));
  nextBtn.addEventListener("click", () => goToSlide(currentSlide + 1));

  goToSlide(0); // 初期表示を整える

});
