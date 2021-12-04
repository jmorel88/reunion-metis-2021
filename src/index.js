import gsap from "gsap";
import * as THREE from "three";
import * as poseDetection from "@tensorflow-models/pose-detection";
import "@tensorflow/tfjs-backend-webgl";
import Stats from "stats.js";
import vertexShader from "./shaders/vertex.glsl?raw";
import fragmentShader from "./shaders/fragment.glsl?raw";

import buildingOneBackground from "./sets/set-1.jpg";
import buildingOneForeground from "./sets/set-1.svg?raw";
import buildingTwoBackground from "./sets/set-2.jpg";
import buildingTwoForeground from "./sets/set-2.svg?raw";
import buildingThreeBackground from "./sets/set-3.jpg";
import buildingThreeForeground from "./sets/set-3.svg?raw";

/* Add stats to DOM */
export const addStats = () => {
  const stats = new Stats();
  stats.showPanel(0);
  document.body.appendChild(stats.dom);
  return stats;
};

/* New Person in scene */
function Person(id) {
  this.id = id;
  this.throttling = false;
  this.lastPosition = { x: 0, y: 0 };
}

export default class Installation {
  constructor(testing = false) {
    if (testing) {
      this.stats = addStats();
    }

    this.background = document.getElementById("background");
    this.foreground = document.querySelector(".foreground");

    this.viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    this.clipspace = {
      width: 0,
      height: 0,
    };

    this.sceneIsChanging = false;
    this.people = [];
    this.meshes = [];
    this.activeSet = 1;
    this.set = null;

    this.textureLoader = new THREE.TextureLoader();
    this.geometry = new THREE.PlaneGeometry(1, 1);

    this.update = this.update.bind(this);
    this.changeSet = this.changeSet.bind(this);
    this.addAttractorFlower = this.addAttractorFlower.bind(this);
  }

  async init() {
    // person detector
    this.detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      {
        modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
        enableTracking: true,
        minPoseScore: 0.3,
      }
    );

    // create sets
    this.sets = [
      {
        building: {
          background: buildingOneBackground,
          foreground: buildingOneForeground,
        },
        textures: this.initFlowerSet([
          `/flower-11.png`,
          `/flower-12.png`,
          `/flower-13.png`,
          `/flower-14.png`,
          `/flower-15.png`,
        ]),
      },
      {
        building: {
          background: buildingTwoBackground,
          foreground: buildingTwoForeground,
        },
        textures: this.initFlowerSet([
          `/flower-1.png`,
          `/flower-2.png`,
          `/flower-3.png`,
          `/flower-4.png`,
          `/flower-5.png`,
        ]),
      },
      {
        building: {
          background: buildingThreeBackground,
          foreground: buildingThreeForeground,
        },
        textures: this.initFlowerSet([
          `/flower-6.png`,
          `/flower-7.png`,
          `/flower-8.png`,
          `/flower-9.png`,
          `/flower-10.png`,
        ]),
      },
    ];

    this.set = this.sets[this.activeSet];

    // init parts
    this.video = await this.initVideo();
    this.renderer = this.initRenderer();
    this.scene = this.initScene();
    this.camera = this.initCamera();
    this.resizer = this.initResize();
    this.overlay = this.initOverlay();

    // start
    const durationOfSet = 1000 * 60 * 3; // 3 minutes
    this.video.addEventListener("loadeddata", this.update);
    setInterval(this.changeSet, durationOfSet);
    this.changeSet();

    // attract
    setInterval(this.addAttractorFlower, 1000 * 3);
  }

  initFlowerSet(images) {
    return images.map((flower) => {
      const texture = this.textureLoader.load(flower);
      texture.generateMipmaps = false;
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      return texture;
    });
  }

  async initVideo() {
    const video = document.getElementById("video");
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    return video;
  }

  initRenderer() {
    const canvas = document.getElementById("canvas");
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(this.viewport.width, this.viewport.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    return renderer;
  }

  initScene() {
    return new THREE.Scene();
  }

  initCamera() {
    const fov = 45;
    const aspect = this.viewport.width / this.viewport.height;
    const near = 1;
    const far = 1000;
    const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    camera.position.z = 5;

    return camera;
  }

  initOverlay() {
    const overlay = document.getElementById("overlay");

    const tween = gsap.to(overlay, {
      opacity: 0,
      duration: 1.2,
      ease: "Power3.easeInOut",
      paused: true,
    });

    return {
      hide: () => {
        this.overlayHidden = true;
        tween.play();
      },
      show: () => {
        this.overlayHidden = false;
        tween.reverse();
      },
    };
  }

  initResize() {
    const resize = () => {
      this.viewport.width = window.innerWidth;
      this.viewport.height = window.innerHeight;

      this.renderer.setSize(this.viewport.width, this.viewport.height);

      this.camera.aspect =
        this.renderer.domElement.width / this.renderer.domElement.height;
      this.camera.updateProjectionMatrix();

      const fov = this.camera.fov * (Math.PI / 180);
      const height = 2 * Math.tan(fov / 2) * this.camera.position.z;
      const width = height * this.camera.aspect;

      this.clipspace.height = height;
      this.clipspace.width = width;
    };

    const resizer = new ResizeObserver(resize);
    resizer.observe(document.body);
    resize();

    return resizer;
  }

  async update() {
    this.stats && this.stats.begin();

    this.renderer.render(this.scene, this.camera);

    if (this.sceneIsChanging) {
      this.stats && this.stats.end();
      requestAnimationFrame(this.update);
      return;
    }

    const foundPeople = await this.detector.estimatePoses(this.video);

    // handle overlay
    if (!foundPeople.length && this.overlayHidden) {
      this.overlayHidden = false;
      this.overlayTO = setTimeout(() => this.overlay.show(), 1000 * 30);
      this.stats && this.stats.end();
      requestAnimationFrame(this.update);
      return;
    } else if (foundPeople.length && !this.overlayHidden) {
      clearTimeout(this.overlayTO);
      this.overlay.hide();
    }

    foundPeople.forEach((person) => {
      const leftWrist = this.filterParts(person, "left_wrist");
      leftWrist && this.setMeshPosition(leftWrist);

      const rightWrist = this.filterParts(person, "right_wrist");
      rightWrist && this.setMeshPosition(rightWrist);
    });

    this.stats && this.stats.end();

    requestAnimationFrame(this.update);
  }

  setMeshPosition({ x, y, id, name }) {
    const multi = Math.random() * 30 + -15;

    const mappedX = gsap.utils.mapRange(
      0,
      640,
      0,
      this.viewport.width,
      x + multi
    );

    const mappedY = gsap.utils.mapRange(
      0,
      480,
      0,
      this.viewport.height,
      y + multi
    );

    // if person is not in bounds, return
    if (mappedX > this.viewport.width || mappedY > this.viewport.height) return;

    // check for existing person
    let existingPerson = this.people.find((person) => person.id === name + id);

    // if no exisiting person we create one
    if (!existingPerson) {
      existingPerson = new Person(name + id);
    }

    // if the person is in throttle we return
    if (existingPerson.throttle) {
      return;
    }

    // else we set the throttle to true and pass in a threshold before next draw
    let threshold = 10;
    existingPerson.throttle = true;
    setTimeout(() => (existingPerson.throttle = false), threshold);

    // if the person has not moved we return
    if (
      (existingPerson.lastPosition.x <= x + 3 &&
        existingPerson.lastPosition.x >= x - 3) ||
      (existingPerson.lastPosition.y <= y + 3 &&
        existingPerson.lastPosition.y >= y - 3)
    ) {
      return;
    }

    // else we set the lastPosition
    existingPerson.lastPosition = { x, y };

    // cache the data
    this.people.push(existingPerson);

    // calc position in clipspace
    const zeroToOneX = (mappedX / this.viewport.width) * this.clipspace.width;
    const zeroToOneY = (mappedY / this.viewport.height) * this.clipspace.height;
    const clipspaceX = zeroToOneX - this.clipspace.width * 0.5;
    const clipspaceY = -1 * (zeroToOneY - this.clipspace.height * 0.5);

    // check if person is on top of architecture
    let temporaryFlower = this.personIsOnArchitecture({
      x: mappedX,
      y: mappedY,
    });

    // and finally addMeshToCanvas
    this.addMeshToCanvas(clipspaceX, clipspaceY, temporaryFlower);
  }

  personIsOnArchitecture({ x, y }) {
    const isOverElement = document.elementFromPoint(x, y);
    return isOverElement && isOverElement.id === "foreground";
  }

  addMeshToCanvas(x, y, isTemporary) {
    // find a random flower material
    const flower =
      this.set.textures[Math.floor(Math.random() * this.set.textures.length)];

    // create the mesh
    const mesh = this.createMesh(flower);
    mesh.scale.set(0.0);
    mesh.position.x = x;
    mesh.position.y = y;

    this.meshes.push(mesh);
    this.scene.add(mesh);

    // entrance
    let scale = Math.max(0.35, Math.random() * 0.85);
    gsap.to(mesh.scale, { x: scale, y: scale, z: scale, duration: 0.15 });

    // exit
    gsap.to(mesh.material.uniforms.uAlpha, {
      value: 0,
      ease: "Power3.easeIn",
      delay: isTemporary ? 0.25 : 15,
      onComplete: () => {
        mesh.material.dispose();
        this.scene.remove(mesh);
      },
    });
  }

  addAttractorFlower() {
    if (this.sceneIsChanging) return;

    const mappedX = gsap.utils.mapRange(
      0,
      640,
      0,
      this.viewport.width,
      640 * Math.random()
    );

    const mappedY = gsap.utils.mapRange(
      0,
      480,
      0,
      this.viewport.height,
      480 * Math.random()
    );

    // calc position in clipspace
    const zeroToOneX = (mappedX / this.viewport.width) * this.clipspace.width;
    const zeroToOneY = (mappedY / this.viewport.height) * this.clipspace.height;
    const x = zeroToOneX - this.clipspace.width * 0.5;
    const y = -1 * (zeroToOneY - this.clipspace.height * 0.5);

    this.addMeshToCanvas(x, y, false);
  }

  createMesh(texture) {
    const material = new THREE.RawShaderMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        tMap: { value: texture },
        uAlpha: { value: 1.0 },
      },
    });

    return new THREE.Mesh(this.geometry, material);
  }

  filterParts(person, part) {
    const points = person.keypoints.find((point) => point.name === part);

    if (!points) return;

    return {
      x: points.x,
      y: points.y,
      id: person.id,
      name: points.name,
    };
  }

  changeSet() {
    this.sceneIsChanging = true;

    this.overlay.show();

    gsap.to([this.renderer.domElement, this.background], {
      opacity: 0,
      duration: 2,
      onComplete: () => {
        // cleanup current scene
        this.meshes.forEach((mesh) => {
          mesh.material.dispose();
          this.scene.remove(mesh);
        });

        this.selectNextSet();

        setTimeout(() => {
          gsap.to([this.renderer.domElement, this.background], {
            opacity: 1,
            duration: 2,
            onComplete: () => (this.sceneIsChanging = false),
          });
        }, 3000);
      },
    });
  }

  selectNextSet() {
    const isLastSet = this.activeSet === this.sets.length - 1;
    this.activeSet = isLastSet ? 0 : this.activeSet + 1;
    this.set = this.sets[this.activeSet];
    this.background.src = this.set.building.background;
    this.foreground.innerHTML = this.set.building.foreground;
  }
}
