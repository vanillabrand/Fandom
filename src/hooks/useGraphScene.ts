import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Manages the static 3D scene elements: Lights, Starfield.
 * Ensures they are only added once per graph instance.
 */
export const useGraphScene = (fgRef: any) => {
    const sceneInitialized = useRef(false);

    useEffect(() => {
        if (!fgRef || sceneInitialized.current) return;

        const scene = fgRef.scene();
        if (!scene) return;

        console.log("[useGraphScene] Initializing Static Scene Elements...");

        // 1. Clear & Reset (Safety check)
        // We only remove lights/starfield we know we added to avoid stripping internal FG3D items if any
        const existingStarfield = scene.getObjectByName('starfield');
        if (existingStarfield) scene.remove(existingStarfield);

        const lights = scene.children.filter((child: any) => child.isLight);
        lights.forEach((l: any) => scene.remove(l));

        // 2. Lighting Setup
        // [FIX] Increased Ambient Light for better global visibility
        scene.add(new THREE.AmbientLight(0x051810, 1.2));

        // [FIX] Stronger Key Light
        const keyLight = new THREE.DirectionalLight(0xffffff, 3.5);
        keyLight.position.set(100, 200, 100);
        scene.add(keyLight);

        // [FIX] Brighter Fill/Rim Light
        const rimLight = new THREE.DirectionalLight(0x8b5cf6, 2.5);
        rimLight.position.set(-100, -100, -100);
        scene.add(rimLight);

        const pointLight = new THREE.PointLight(0x10b981, 1.5, 1000);
        pointLight.position.set(0, 0, 200);
        scene.add(pointLight);

        const spotLight = new THREE.SpotLight(0xffffff, 5);
        spotLight.position.set(50, 50, 400);
        spotLight.angle = Math.PI / 6;
        spotLight.penumbra = 0.5;
        scene.add(spotLight);

        // Core light for the center
        const coreLight = new THREE.PointLight(0xffffff, 3, 300);
        coreLight.position.set(0, 0, 0);
        scene.add(coreLight);

        // 3. Starfield
        const starGeometry = new THREE.BufferGeometry();
        const starCount = 8000;
        const starPositions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount * 3; i++) {
            starPositions[i] = (Math.random() - 0.5) * 4000;
        }
        starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        const starMaterial = new THREE.PointsMaterial({
            color: 0x10b981,
            size: 1.5,
            transparent: true,
            opacity: 0.8,
            sizeAttenuation: true
        });
        const starMesh = new THREE.Points(starGeometry, starMaterial);
        starMesh.name = 'starfield';
        scene.add(starMesh);

        sceneInitialized.current = true;
        console.log("[useGraphScene] Scene Initialized.");

    }, [fgRef]);
};
