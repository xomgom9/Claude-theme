const CAR_COMFORT_SECTION_SELECTOR = '.cc-product-section[id^="cc-product-"]';

function initCarComfortProduct(section) {
  if (!(section instanceof HTMLElement) || section.dataset.ccVariantFixReady === 'true') return;

  const variantsNode = section.querySelector('[data-product-variants]');
  if (!variantsNode) return;

  let variants = [];
  let variantMoney = {};
  try {
    variants = JSON.parse(variantsNode.textContent || '[]');
    const moneyNode = section.querySelector('[data-product-money]');
    variantMoney = moneyNode ? JSON.parse(moneyNode.textContent || '{}') : {};
  } catch (error) {
    console.error('Unable to initialize car comfort variant fixes', error);
    return;
  }

  if (!Array.isArray(variants) || variants.length === 0) return;
  section.dataset.ccVariantFixReady = 'true';

  const optionGroups = [...section.querySelectorAll('[data-option-position]')];
  const variantIdInput = section.querySelector('[data-variant-id]');
  const currentPrice = section.querySelector('[data-current-price]');
  const oldPrice = section.querySelector('[data-old-price]');
  const saveBadge = section.querySelector('[data-save-badge]');
  const saveAmount = section.querySelector('[data-save-amount]');
  const stock = section.querySelector('[data-stock]');
  const purchaseButtons = [...section.querySelectorAll('[data-add-button], [data-buy-button], .cc-product-sticky button')];
  const mediaItems = [...section.querySelectorAll('.cc-product-media')];
  const thumbnails = [...section.querySelectorAll('.cc-product-thumbnail')];
  const counter = section.querySelector('.cc-product-counter');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const selectedValues = () => optionGroups.map((group) => group.querySelector('.is-selected')?.dataset.optionValue);
  const findVariant = (values) => variants.find((variant) => variant.options.every((value, index) => value === values[index]));

  const findBestAvailableVariant = (values, changedIndex) => {
    const exact = findVariant(values);
    if (exact?.available) return exact;

    const candidates = variants.filter(
      (variant) => variant.available && variant.options[changedIndex] === values[changedIndex]
    );

    return candidates.reduce((best, variant) => {
      const score = variant.options.reduce(
        (total, value, index) => total + (index !== changedIndex && value === values[index] ? 1 : 0),
        0
      );
      return !best || score > best.score ? { variant, score } : best;
    }, null)?.variant;
  };

  const syncOptionSelections = (variant) => {
    optionGroups.forEach((group, index) => {
      const selectedValue = variant.options[index];
      group.querySelectorAll('[data-option-value]').forEach((button) => {
        const selected = button.dataset.optionValue === selectedValue;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      const label = group.querySelector('[data-selected-option]');
      if (label) label.textContent = selectedValue;
    });
  };

  const updateOptionAvailability = () => {
    optionGroups.forEach((group, groupIndex) => {
      group.querySelectorAll('[data-option-value]').forEach((button) => {
        const available = variants.some(
          (variant) => variant.available && variant.options[groupIndex] === button.dataset.optionValue
        );
        button.classList.toggle('is-unavailable', !available);
        button.disabled = !available;
      });
    });
  };

  const showMedia = (target) => {
    const next = mediaItems.find((item) => item.dataset.mediaId === target);
    if (!next) return;

    mediaItems.forEach((item) => {
      const active = item === next;
      item.classList.toggle('is-active', active);
      item.querySelectorAll('video').forEach((video) => {
        if (!active) video.pause();
      });
    });

    thumbnails.forEach((thumb) => {
      const active = thumb.dataset.mediaTarget === target;
      thumb.classList.toggle('is-active', active);
      thumb.setAttribute('aria-selected', String(active));
      if (active) {
        thumb.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'nearest' });
      }
    });

    if (counter) counter.textContent = `${mediaItems.indexOf(next) + 1}/${mediaItems.length}`;
  };

  const updateVariant = (variant) => {
    if (!variant) return;

    if (variantIdInput) variantIdInput.value = variant.id;
    const localizedMoney = variantMoney[String(variant.id)] || {};
    if (currentPrice && localizedMoney.price) currentPrice.textContent = localizedMoney.price;

    const discounted = Number(variant.compare_at_price || 0) > Number(variant.price || 0);
    oldPrice?.classList.toggle('is-hidden', !discounted);
    saveBadge?.classList.toggle('is-hidden', !discounted);
    if (oldPrice && discounted && localizedMoney.compareAt) oldPrice.textContent = localizedMoney.compareAt;
    if (saveAmount && discounted && localizedMoney.savings) saveAmount.textContent = localizedMoney.savings;

    if (stock) {
      stock.classList.toggle('is-sold-out', !variant.available);
      if (stock.lastChild) stock.lastChild.textContent = variant.available ? 'In stock' : 'Sold out';
    }

    purchaseButtons.forEach((button) => {
      button.disabled = !variant.available;
      const label = button.querySelector('[data-button-label]');
      if (label) {
        label.textContent = variant.available
          ? button.classList.contains('cc-product-add') ? 'Add to Cart' : 'Buy Now'
          : 'Sold Out';
      }
    });

    const featuredId = variant.featured_media?.id || variant.featured_image?.id;
    if (featuredId) showMedia(`media-${featuredId}`);

    const url = new URL(window.location.href);
    url.searchParams.set('variant', variant.id);
    window.history.replaceState({}, '', url);
    updateOptionAvailability();
  };

  section.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest('[data-option-value]');
    if (!button || !section.contains(button)) return;

    const group = button.closest('[data-option-position]');
    const groupIndex = optionGroups.indexOf(group);
    if (groupIndex < 0 || button.disabled) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const values = selectedValues();
    values[groupIndex] = button.dataset.optionValue;
    const nextVariant = findBestAvailableVariant(values, groupIndex);
    if (!nextVariant) {
      updateOptionAvailability();
      return;
    }

    syncOptionSelections(nextVariant);
    updateVariant(nextVariant);
  }, true);

  updateOptionAvailability();

  if (!('IntersectionObserver' in window)) {
    section.querySelector('.cc-product-sticky')?.classList.add('is-visible');
  }
}

function initCarComfortProducts(root = document) {
  if (root instanceof Element && root.matches(CAR_COMFORT_SECTION_SELECTOR)) {
    initCarComfortProduct(root);
  }
  root.querySelectorAll?.(CAR_COMFORT_SECTION_SELECTOR).forEach(initCarComfortProduct);
}

initCarComfortProducts();
document.addEventListener('shopify:section:load', (event) => initCarComfortProducts(event.target));
