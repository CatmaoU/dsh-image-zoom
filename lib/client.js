// dsh-image-zoom client：对话流图片单击放大预览（Ctrl+滚轮缩放、拖拽平移、Esc/背景关闭）
// 覆盖：用户发送的图片（dsh-drop-in 的 ddrop-msg-img 裸 img）、assistant 返回的
// markdown 内联图片、官方 ImageGallery 的 button.frame 缩略图（capture 阶段接管，
// 官方 ImageLightbox 不再触发——它只有纯预览、无缩放）。
window.__ModuleLoader__.load({
	id: "dsh-image-zoom",
	factory: (require) => {
		var module = { exports: {} };
		module.exports = {
			name: "image-zoom-client",
			inject: [],
			apply(ctx) {
				const STYLE_ID = "dsh-image-zoom-style";
				const ATTR = "data-dsh-image-zoom";
				const isFlowImage = (img) => {
					if (!(img instanceof HTMLImageElement)) return false;
					if (!(img.currentSrc || img.src)) return false;
					const r = img.getBoundingClientRect();
					// 排除图标/头像/emoji 之类小图（32px 以下）
					if (r.width < 32 || r.height < 32) return false;
					// 只接管对话流内的图片
					return !!img.closest("[data-chat-flow], [data-focus-flow], [data-chat-flow-key]");
				};
				let root = null;
				let lightboxImg = null;
				let zoomLabel = null;
				let lastFocus = null;
				let scale = 1;
				let tx = 0;
				let ty = 0;
				let visible = false;
				const ensureStyle = () => {
					if (document.getElementById(STYLE_ID) !== null) return;
					const style = document.createElement("style");
					style.id = STYLE_ID;
					style.textContent = `
[${ATTR}] {
  position: fixed; inset: 0; z-index: 2147483000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, .86);
}
[${ATTR}][data-hidden] { display: none; }
[${ATTR}-mask] { position: absolute; inset: 0; cursor: zoom-out; }
[${ATTR}-img] {
  position: relative; max-width: 92vw; max-height: 88vh;
  object-fit: contain; transform-origin: center center;
  transition: transform .08s ease-out;
  cursor: grab; user-select: none; -webkit-user-drag: none;
  border-radius: 4px; box-shadow: 0 8px 40px rgba(0, 0, 0, .6);
}
[${ATTR}-img][data-dragging] { cursor: grabbing; transition: none; }
[${ATTR}-zoom] {
  position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
  background: rgba(20, 20, 24, .82); color: #eee;
  font: 12px/1 system-ui; padding: 4px 10px; border-radius: 999px;
  pointer-events: none; letter-spacing: .3px;
}
[${ATTR}-hint] {
  position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%);
  background: rgba(20, 20, 24, .7); color: rgba(238, 238, 238, .85);
  font: 11px/1.4 system-ui; padding: 6px 12px; border-radius: 8px;
  pointer-events: none; text-align: center; white-space: nowrap;
}
[${ATTR}-close] {
  position: absolute; top: 12px; right: 12px; width: 34px; height: 34px;
  border-radius: 50%; border: none; background: rgba(20, 20, 24, .82);
  color: #eee; font-size: 18px; line-height: 1; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
[${ATTR}-close]:hover { background: rgba(60, 60, 68, .92); }
`;
					document.head.appendChild(style);
				};
				const ensureDom = () => {
					if (root !== null) return;
					root = document.createElement("div");
					root.setAttribute(ATTR, "");
					root.setAttribute("data-hidden", "");
					root.setAttribute("role", "dialog");
					root.setAttribute("aria-modal", "true");
					root.setAttribute("aria-label", "图片预览");
					const mask = document.createElement("div");
					mask.setAttribute(ATTR + "-mask", "");
					const img = document.createElement("img");
					img.setAttribute(ATTR + "-img", "");
					img.alt = "";
					const zoom = document.createElement("div");
					zoom.setAttribute(ATTR + "-zoom", "");
					zoom.textContent = "100%";
					const hint = document.createElement("div");
					hint.setAttribute(ATTR + "-hint", "");
					hint.textContent = "Ctrl + 滚轮缩放 · 拖拽平移 · 双击复位 · Esc / 点击空白关闭";
					const close = document.createElement("button");
					close.type = "button";
					close.setAttribute(ATTR + "-close", "");
					close.setAttribute("aria-label", "关闭预览");
					close.textContent = "✕";
					root.append(mask, img, zoom, hint, close);
					document.body.appendChild(root);
					lightboxImg = img;
					zoomLabel = zoom;
					// 双击复位
					img.addEventListener("dblclick", () => {
						scale = 1;
						tx = 0;
						ty = 0;
						applyTransform();
					});
					// 拖拽平移（监听挂 lightbox root 上，随 root 销毁自动清理——零常驻全局监听）
					let dragging = false;
					let start = null;
					root.addEventListener("pointerdown", (e) => {
						if (scale <= 1) return;
						dragging = true;
						start = { x: e.clientX, y: e.clientY, tx, ty };
						img.setAttribute("data-dragging", "");
						e.preventDefault();
					});
					root.addEventListener("pointermove", (e) => {
						if (!dragging || start === null) return;
						tx = start.tx + (e.clientX - start.x);
						ty = start.ty + (e.clientY - start.y);
						applyTransform();
					});
					root.addEventListener("pointerup", () => {
						dragging = false;
						start = null;
						img.removeAttribute("data-dragging");
					});
				};
				const applyTransform = () => {
					if (lightboxImg === null) return;
					lightboxImg.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
					if (zoomLabel !== null) zoomLabel.textContent = `${Math.round(scale * 100)}%`;
				};
				const openLightbox = (img) => {
					ensureStyle();
					ensureDom();
					const src = img.currentSrc || img.src;
					lightboxImg.src = src;
					lightboxImg.alt = img.alt || "";
					scale = 1;
					tx = 0;
					ty = 0;
					applyTransform();
					lastFocus = document.activeElement;
					root.removeAttribute("data-hidden");
					attachWheel();
					visible = true;
				};
				const closeLightbox = () => {
					if (!visible || root === null) return;
					visible = false;
					detachWheel();
					root.setAttribute("data-hidden", "");
					lightboxImg.src = "";
					if (lastFocus !== null && lastFocus instanceof HTMLElement) lastFocus.focus();
					lastFocus = null;
				};
				const onKeyDown = (e) => {
					if (e.key === "Escape") closeLightbox();
				};
				const onWheel = (e) => {
					if (!visible) return;
					e.preventDefault();
					e.stopPropagation();
					if (!e.ctrlKey) return;
					const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
					scale = Math.min(8, Math.max(1, scale * factor));
					applyTransform();
				};
				const onClick = (e) => {
					if (visible) {
						// 预览打开时：mask/关闭按钮/根空白 → 关闭；图上点击不关（拖拽区）
						if (e.target === maskEl() || e.target === closeEl() || e.target === root) {
							closeLightbox();
						}
						return;
					}
					const t = e.target;
					const img = t instanceof HTMLImageElement ? t : t instanceof Element && t.closest !== void 0 ? t.closest("img") : null;
					if (img === null || !isFlowImage(img)) return;
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
					openLightbox(img);
				};
				const maskEl = () => root?.querySelector(`[${ATTR}-mask]`) ?? null;
				const closeEl = () => root?.querySelector(`[${ATTR}-close]`) ?? null;
				// 懒注册 wheel：仅 lightbox 打开时监听，避免常驻 capture+passive:false 拖慢页面滚动
				const attachWheel = () => window.addEventListener("wheel", onWheel, { capture: true, passive: false });
				const detachWheel = () => window.removeEventListener("wheel", onWheel, { capture: true });
				document.addEventListener("click", onClick, true);
				window.addEventListener("keydown", onKeyDown);
				return () => {
					document.removeEventListener("click", onClick, true);
					window.removeEventListener("keydown", onKeyDown);
					detachWheel();
					root?.remove();
					document.getElementById(STYLE_ID)?.remove();
					root = null;
					lightboxImg = null;
					visible = false;
				};
			}
		};
		return module.exports;
	}
});
