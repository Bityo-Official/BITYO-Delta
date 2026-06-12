"use client";
// Hero3D.tsx — animated 3D "cross-exchange network": a slowly-rotating constellation
// of nodes linked by faint lines, with a few brighter exchange nodes. Evokes seven
// venues converging into one delta-neutral view. Lightweight, transparent background,
// subtle mouse parallax. Cleans up fully on unmount.
import { useEffect, useRef } from "react";
import * as THREE from "three";

export function Hero3D() {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const mount = ref.current;
		if (!mount) return;
		// respect reduced-motion
		const reduce = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;

		let w = mount.clientWidth || 1;
		let h = mount.clientHeight || 1;

		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(58, w / h, 0.1, 100);
		camera.position.z = 15;

		const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
		renderer.setSize(w, h);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		mount.appendChild(renderer.domElement);

		const group = new THREE.Group();
		scene.add(group);

		// ── nodes distributed on a spherical shell ──
		const N = 280;
		const pts: THREE.Vector3[] = [];
		const positions = new Float32Array(N * 3);
		for (let i = 0; i < N; i++) {
			const r = 6 + Math.random() * 2.6;
			const theta = Math.random() * Math.PI * 2;
			const phi = Math.acos(2 * Math.random() - 1);
			const v = new THREE.Vector3(
				r * Math.sin(phi) * Math.cos(theta),
				r * Math.sin(phi) * Math.sin(theta),
				r * Math.cos(phi),
			);
			pts.push(v);
			positions.set([v.x, v.y, v.z], i * 3);
		}
		const pGeo = new THREE.BufferGeometry();
		pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
		const pMat = new THREE.PointsMaterial({
			color: 0x9aa2f5,
			size: 0.08,
			transparent: true,
			opacity: 0.85,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
		});
		const points = new THREE.Points(pGeo, pMat);
		group.add(points);

		// ── connections between near neighbours ──
		const linePos: number[] = [];
		for (let i = 0; i < N; i++) {
			for (let j = i + 1; j < N; j++) {
				if (pts[i].distanceTo(pts[j]) < 2.15 && Math.random() < 0.5) {
					linePos.push(
						pts[i].x,
						pts[i].y,
						pts[i].z,
						pts[j].x,
						pts[j].y,
						pts[j].z,
					);
				}
			}
		}
		const lGeo = new THREE.BufferGeometry();
		lGeo.setAttribute(
			"position",
			new THREE.BufferAttribute(new Float32Array(linePos), 3),
		);
		const lMat = new THREE.LineBasicMaterial({
			color: 0x5e6ad2,
			transparent: true,
			opacity: 0.16,
			blending: THREE.AdditiveBlending,
			depthWrite: false,
		});
		const lines = new THREE.LineSegments(lGeo, lMat);
		group.add(lines);

		// ── a handful of brighter "exchange" nodes ──
		const brightGeo = new THREE.SphereGeometry(0.13, 16, 16);
		const brightMats: THREE.Material[] = [];
		for (let i = 0; i < 7; i++) {
			const m = new THREE.MeshBasicMaterial({
				color: i % 2 ? 0x2ebd85 : 0x8b93f5,
				transparent: true,
				opacity: 0.95,
				blending: THREE.AdditiveBlending,
			});
			brightMats.push(m);
			const s = new THREE.Mesh(brightGeo, m);
			s.position.copy(
				pts[Math.floor(Math.random() * N)].clone().multiplyScalar(0.96),
			);
			group.add(s);
		}

		// ── mouse parallax ──
		let mx = 0;
		let my = 0;
		const onMove = (e: MouseEvent) => {
			mx = e.clientX / window.innerWidth - 0.5;
			my = e.clientY / window.innerHeight - 0.5;
		};
		window.addEventListener("mousemove", onMove);

		let raf = 0;
		const animate = () => {
			group.rotation.y += reduce ? 0 : 0.0011;
			group.rotation.x += reduce ? 0 : 0.0004;
			camera.position.x += (mx * 3 - camera.position.x) * 0.04;
			camera.position.y += (-my * 3 - camera.position.y) * 0.04;
			camera.lookAt(0, 0, 0);
			renderer.render(scene, camera);
			raf = requestAnimationFrame(animate);
		};
		animate();

		const onResize = () => {
			w = mount.clientWidth || 1;
			h = mount.clientHeight || 1;
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
			renderer.setSize(w, h);
		};
		window.addEventListener("resize", onResize);

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("resize", onResize);
			pGeo.dispose();
			pMat.dispose();
			lGeo.dispose();
			lMat.dispose();
			brightGeo.dispose();
			for (const m of brightMats) m.dispose();
			renderer.dispose();
			if (renderer.domElement.parentNode === mount)
				mount.removeChild(renderer.domElement);
		};
	}, []);

	return <div ref={ref} className="absolute inset-0" aria-hidden="true" />;
}
