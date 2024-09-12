<script lang="ts" setup>
import { onMounted, onUnmounted, Ref, ref, watch } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { XRControllerModelFactory } from "three/examples/jsm/webxr/XRControllerModelFactory.js";
import { XRHandModelFactory } from "three/examples/jsm/webxr/XRHandModelFactory.js";
import { RapierPhysics } from 'three/addons/physics/RapierPhysics.js';
import { BoxLineGeometry } from "three/examples/jsm/geometries/BoxLineGeometry.js";

const { width, height, modelName } = defineProps({
  width: {
    type: Number,
    required: true,
  },
  height: {
    type: Number,
    required: true,
  },
  modelName: {
    type: String,
    required: true,
  },
});

let scene = new THREE.Scene();

let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;

let xrSession: XRSession | undefined;
let xrSessionType: Ref<"ar" | "vr" | undefined> = ref();
let xrSessionIsGranted = false;

let shownModel: THREE.Object3D;
let loadedModel: THREE.Object3D;
let modelIsPlaced = false;
let shownModelIsGrabbed = false;
// let modelIsGrubbing = false;

let reticle: THREE.Mesh | undefined;

let viewerSpace: XRReferenceSpace | undefined;
let localSpace: XRReferenceSpace | undefined;

let hitTestSourceForTransientInput: XRTransientInputHitTestSource | undefined;
let hitTestSource: XRHitTestSource | undefined;

let controller1: THREE.XRTargetRaySpace | undefined;
let controller2: THREE.XRTargetRaySpace | undefined;
let arController: THREE.XRTargetRaySpace | undefined;

let canvasRef = ref();
let overlayContentRef = ref();
let containerRef: Ref<HTMLCanvasElement | undefined> = ref();
let xrButtonsRef: Ref<HTMLDivElement | undefined> = ref();

let ambientLight = new THREE.AmbientLight("#ffffff", 1);
scene.add(ambientLight);

let camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 100);
camera.position.y = 1;
camera.position.z = 2;
camera.lookAt(new THREE.Vector3(0, 0, 0));

scene.add(camera);

reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial()
);
reticle.matrixAutoUpdate = false;
scene.add(reticle);

// let loop = () => {
//   box.rotation.y += 0.02;
//   renderer.render(scene, camera);
//   requestAnimationFrame(loop);
// };

let loop = (_: DOMHighResTimeStamp, frame: XRFrame) => {
  // if (renderer.xr.isPresenting) {
  //   shownModel.visible = false;
  // }

  if (frame) {

    // if (!session || !localSpace) return;

    if (xrSessionType.value === "ar" && hitTestSource && localSpace && xrSession) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);

      if (hitTestResults.length == 0) return;

      if (!modelIsPlaced) {
        const hit = hitTestResults[0];

        const pose = hit.getPose(localSpace)?.transform.matrix

        if (!pose || !reticle) return;

        reticle.matrix.fromArray(pose)
      }

    }
    else if (xrSessionType.value === "vr" && xrSession) {
      // if ( scaling.active ) {

      //   const indexTip1Pos = hand1.joints[ 'index-finger-tip' ].position;
      //   const indexTip2Pos = hand2.joints[ 'index-finger-tip' ].position;
      //   const distance = indexTip1Pos.distanceTo( indexTip2Pos );
      //   const newScale = scaling.initialScale + distance / scaling.initialDistance - 1;
      //   scaling.object.scale.setScalar( newScale );

      // }
    }
  } else if (!xrSessionType.value) {
    scene.children.forEach((object) => {
      if (object.name === modelName) {
        object.rotation.y += 0.01;
      }
    });
  }

  controls.update();
  renderer.render(scene, camera);
};


let resizeCallback = (_?: Event) => {


  if (xrSessionType.value === "vr" && canvasRef.value) {
    renderer.setSize(canvasRef.value.clientWidth, canvasRef.value.clientHeight, true);
    camera.aspect = canvasRef.value.clientWidth / canvasRef.value.clientHeight; 
  } else {
    renderer.setSize(width, height);
    camera.aspect = width / height; 
  }

  camera.updateProjectionMatrix();
};


onMounted(() => {
  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
    alpha: true,
  });

  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.render(scene, camera);
  renderer.xr.enabled = true;

  renderer.setAnimationLoop(loop);
  

  // WebXRViewer (based on Firefox) has a bug where addEventListener
  // throws a silent exception and aborts execution entirely.
  if (typeof navigator !== 'undefined' && 'xr' in navigator) {
    navigator.xr?.addEventListener( 'sessiongranted', () => {

      xrSessionIsGranted = true;

    } );
  }
  if (xrSessionIsGranted) {
    console.log(xrSessionIsGranted);
  }

  controls = new OrbitControls(camera, canvasRef.value);
  controls.enableDamping = true;

  const gltfLoader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath( '/examples/jsm/libs/draco/' );
  gltfLoader.setDRACOLoader( dracoLoader );

  gltfLoader.load(`/models/${modelName}.glb`, (gltf) => {

    loadedModel = gltf.scene.children[0];

    shownModel = loadedModel.clone();

    // for rapier physics
    shownModel.userData.physics = { mass: 1, restitution: 1.1 };

    shownModel.name = modelName;
    shownModel.scale.set(0.5, 0.5, 0.5);
    scene.add(shownModel);
  });

  window.addEventListener("resize", resizeCallback);

  //   requestAnimationFrame(loop);
});

onUnmounted(() => {
  renderer.setAnimationLoop(null);
  window.removeEventListener("resize", resizeCallback);
});

async function initPhysics() {

  // https://rapier.rs/docs/api/javascript/JavaScript3D/
  // https://rapier.rs/docs/user_guides/javascript/getting_started_js/

  const physics = await RapierPhysics();

  // userData.physics = mass, restitution
  // also can set mesh velocity by physics.setMeshVelocity(mesh, velocity, index?)

  const floor = new THREE.Mesh( new THREE.BoxGeometry( 6, 2, 6 ), new THREE.MeshNormalMaterial( { visible: false } ) );
  floor.position.y = - 1;

  floor.userData.physics = { mass: 0 };
  scene.add( floor );


  physics.addScene( scene );
}


async function startXr(sessionType: "ar" | "vr") {
  if (!navigator.xr) return;

  const isVrSupported = await navigator.xr.isSessionSupported( 'immersive-vr' );
  const isArSupported = await navigator.xr.isSessionSupported( 'immersive-ar' )

  if (!isArSupported && !isVrSupported) return;

  sessionType === "ar" ? startAR() : startVR()

}

async function initHitTestSources() {

  if (!xrSession || !xrSession
  .requestHitTestSource || !xrSession.requestHitTestSourceForTransientInput) return;

  try {
      localSpace = await xrSession.requestReferenceSpace("local");
      viewerSpace = await xrSession.requestReferenceSpace("viewer");

      // Transient input represents pointer input, such as touch and it's position
      // device platfrom implements transient input profile
      // transient inputs occure for short time
      // see docs https://immersive-web.github.io/webxr/input-explainer.html#screen
      // https://immersive-web.github.io/hit-test/hit-testing-explainer.html#pre-registration-for-transient-input-sources

      // https://github.com/immersive-web/webxr-input-profiles/blob/master/packages/registry/profiles/oculus/oculus-touch.json

      hitTestSourceForTransientInput = await xrSession.requestHitTestSourceForTransientInput({
        profile: "generic-touchscreen",
        offsetRay: new XRRay(),
      });

      // Viewer hit test source represents the current looking direction of a camera
      hitTestSource = await xrSession.requestHitTestSource({
        space: viewerSpace,
      });

    } catch (e) {
      console.error(e);
    }

    xrSession.addEventListener("end", () => {
      hitTestSourceForTransientInput?.cancel();
      hitTestSource?.cancel();
      hitTestSourceForTransientInput = undefined;
      hitTestSource = undefined;

      reticle = undefined;
      // controller = null;
      // controller2 = null;

      localSpace = undefined;
      viewerSpace = undefined;

      // isPlaced = false;
      // isTouchDown = false;
      // isModelMoving = false;

      // positionPrevious = { x: 0, y: 0, z: 0 };
      // positionCurrent = { x: 0, y: 0, z: 0 };
    });

}

// async function startMR() {
//   // https://github.com/mrdoob/three.js/blob/master/examples/webxr_xr_ballshooter.html
// }

async function startVR() {
  if (!navigator.xr) return;
  // https://developer.mozilla.org/en-US/docs/Web/API/XRSystem/requestSession#session_features

  // features
  // high-refresh-rate
  // high-fixed-foveation-level
  // plane-detection https://developer.oculus.com/documentation/web/webxr-mixed-reality/#plane-detection
  // https://github.com/immersive-web/WebXR-WebGPU-Binding/blob/main/explainer.md

  // physics
  // https://discourse.threejs.org/t/new-version-of-rapier-physics-three-js-demo-app/48755

  // optimisation 
  // https://developer.oculus.com/documentation/web/webxr-perf/

  try {
    xrSession = await navigator.xr.requestSession("immersive-vr", {
      requiredFeatures: [],
      optionalFeatures: [
        'local-floor',
        'bounded-floor',
        'layers',
        "hand-tracking",
        "dom-overlay"
      ],
      domOverlay: {
        root: canvasRef.value ? canvasRef.value : document.body,
      },
    });
  } catch (error) {
    console.log("err")
  }

  // vrOverlayHTML

  if (!xrSession) return;
  xrSessionType.value = "vr";

  // session.addEventListener( 'end', onSessionEnded );

  await initVRControls();
  // await initPhysics();

  renderer.xr.setReferenceSpaceType("local-floor");
  await renderer.xr.setSession( xrSession );

  resizeCallback();
  
}

async function initVRControls() {

  //https://immersive-web.github.io/webxr/#xrinputsource-interface

  // enum XRHandedness {
  //   "none",
  //   "left",
  //   "right"
  // };

  // enum XRTargetRayMode {
  //   "gaze",
  //   "tracked-pointer",
  //   "screen",
  //   "transient-pointer"
  // };

  // interface XRInputSource {
  //   readonly attribute XRHandedness handedness;
  //   readonly attribute XRTargetRayMode targetRayMode;
  //   [SameObject] readonly attribute XRSpace targetRaySpace;
  //   [SameObject] readonly attribute XRSpace? gripSpace;
  //   [SameObject] readonly attribute FrozenArray<DOMString> profiles;
  //   readonly attribute boolean skipRendering;
  // };



  //creates new controller
  // https://github.com/mrdoob/three.js/blob/dev/src/renderers/webxr/WebXRController.js
  // https://github.com/mrdoob/three.js/blob/dev/src/renderers/webxr/WebXRManager.js#L77
  
  controller1 = renderer.xr.getController( 0 );
  scene.add( controller1 );

  controller1.addEventListener("selectstart", onSelectStartRight);
  controller1.addEventListener("selectend", onSelectEndtRight);
  

  controller2 = renderer.xr.getController( 1 );
  scene.add( controller2 );

  // for (let controller of [controller1, controller2]) {
  //   controller.addEventListener("selectstart", () => {

  //   })
  // }

  const controllerModelFactory = new XRControllerModelFactory();
  const handModelFactory = new XRHandModelFactory();

  //https://immersive-web.github.io/webxr/#dom-xrinputsource-gripspace
  let controllerGrip1 = renderer.xr.getControllerGrip( 0 );
  controllerGrip1.add( controllerModelFactory.createControllerModel( controllerGrip1 ) );
  scene.add( controllerGrip1 );

  let hand1 = renderer.xr.getHand( 0 );
  // hand1.addEventListener( 'pinchstart', onPinchStartLeft );
  // hand1.addEventListener( 'pinchend', () => {

  //   scaling.active = false;

  // } );
  hand1.add( handModelFactory.createHandModel( hand1 ) );

  scene.add( hand1 );

  // Hand 2
  let controllerGrip2 = renderer.xr.getControllerGrip( 1 );
  controllerGrip2.add( controllerModelFactory.createControllerModel( controllerGrip2 ) );
  scene.add( controllerGrip2 );

  let hand2 = renderer.xr.getHand( 1 );

  // pinchstart Event break the THREE.EventDispatcher contract, replacing the target to the wrong instance.

  // hand2.addEventListener( 'selectstart', onSelectStartRight );
  // hand2.addEventListener( 'selectend', onSelectEndtRight );
  hand2.add( handModelFactory.createHandModel( hand2 ) );
  scene.add( hand2 );

  const geometry = new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 1 ) ] );

  const line = new THREE.Line( geometry );
  line.name = 'line';
  line.scale.z = 5;

  controller1.add( line.clone() );
  controller2.add( line.clone() );


  const room = new THREE.LineSegments(
    new BoxLineGeometry( 6, 6, 6, 10, 10, 10 ),
    new THREE.LineBasicMaterial( { color: 0x808080 } )
  );
  room.geometry.translate( 0, 3, 0 );
  scene.add( room );

  scene.background = new THREE.Color( 0x505050 );
  
}

function onSelectStartRight(_: THREE.WebXRSpaceEventMap['selectstart'],) {

  if (!controller1 || shownModelIsGrabbed) return;

  const controller = controller1;
  const modelWorldPosition = new THREE.Vector3();
  shownModel.getWorldPosition(modelWorldPosition);

  const distanceFromBottomCenterToControllerPosition = {
    x: modelWorldPosition.x - controller.position.x,
    y: modelWorldPosition.y - controller.position.y,
    z: modelWorldPosition.z - controller.position.z,
  };

  let shownModelBbox = new THREE.Box3().setFromObject(shownModel);
  let shownModelSize = new THREE.Vector3;
  shownModelBbox.getSize(shownModelSize);
  console.log(shownModelSize);

  if (
    Math.abs(distanceFromBottomCenterToControllerPosition.y) <=
    shownModelSize.y &&
    Math.abs(distanceFromBottomCenterToControllerPosition.x) <=
    shownModelSize.x / 2 &&
    Math.abs(distanceFromBottomCenterToControllerPosition.z) <=
    shownModelSize.z / 2
  ) {

    console.log("Object grab");
    // grabModel(model, controller);
    grabModel();
    shownModelIsGrabbed = true;
    
  }

  function grabModel(){
    controller.attach(shownModel);
    //controller remove ray
  }


  // if (event.data.gamepad) {
  //   event.data.gamepad.hapticActuators[0].pulse(0.5, 100);
  // }

  // console.log(event.data.gamepad)

  // const controller = event.target;
  // const indexTip = controller.joints[ 'index-finger-tip' ];
  // const object = collideObject( indexTip );

  //   const handSpace = hand?.get('index-finger-tip')
  //   const object = collideObject( handSpace );

  // if ( object ) {

  //   modelIsGrubbing = true;
  //   handSpace.attach( object );
  //   // controller.userData.selected = object;
  //   // console.log( 'Selected', object );

  // }

}

function onSelectEndtRight(  ) {

  if (shownModelIsGrabbed) {
    ungrabModel();
  }

  function ungrabModel() {
    scene.attach(shownModel);
    shownModelIsGrabbed = false;
  }

  // if ( controller.userData.isSelecting ) {

  //   physics.setMeshPosition( spheres, controller.position, count );

  //   velocity.x = ( Math.random() - 0.5 ) * 2;
  //   velocity.y = ( Math.random() - 0.5 ) * 2;
  //   velocity.z = ( Math.random() - 9 );
  //   velocity.applyQuaternion( controller.quaternion );

  //   physics.setMeshVelocity( spheres, velocity, count );

  //   if ( ++ count === spheres.count ) count = 0;

  // }





  // const controller = event.target;

  // if ( controller.userData.selected !== undefined ) {

  //   const object = controller.userData.selected;
  //   object.material.emissive.b = 0;
  //   scene.attach( object );

  //   controller.userData.selected = undefined;
  //   grabbing = false;

  // }

  // scaling.active = false;

}

async function startAR() {
  if (!navigator.xr) return;

  try {
    xrSession = await navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["dom-overlay"],
        domOverlay: {
          root: overlayContentRef.value,
        },
      });
  } catch (error) {
    console.log("err")
  }

  if (!xrSession) return;
  xrSessionType.value = "ar";

  renderer.xr.setReferenceSpaceType("local");
  await renderer.xr.setSession( xrSession );

  await initHitTestSources();

  arController = renderer.xr.getController(0);
  arController.addEventListener("select", onSelect);

  function onSelect() {

    if (!reticle) return;

    if (loadedModel) {
      let model = loadedModel.clone();

      model.name = `XR-${modelName}`;
      model.position.setFromMatrixPosition(reticle.matrix);
      model.scale.set(0.3, 0.3, 0.3);
      scene.add(model);

      modelIsPlaced = true;
    }
}
  
  
}

watch(canvasRef, () => {
  console.log("test")
})

</script>

<template>
  <div class="container" ref="containerRef">
    <div class="overlay-content" ref="overlayContentRef">
      <h1>{{ modelName }}</h1>
    </div>
    <canvas ref="canvasRef" :class="{
      'vrOverlay': xrSessionType === 'vr'
    }"></canvas>
    <div class="xrButtons" ref="xrButtonsRef">
      <button @click="startXr('vr')">start vr</button>
      <button @click="startXr('ar')">start ar</button>
    </div>
  </div>

</template>

<style scoped>

.vrOverlay {
  position: absolute;
  width: 100vw;
  height: 100vh;
}

.xrButtons {
  width: auto;
  height: 30px;
  display: flex;
  justify-content: space-around;
  align-items: center;
  flex-direction: row;
  margin: 0 10px;
}

.container {
  position: relative;
  outline: 1px solid white;
  outline-style: dashed;
  border-radius: 1rem;
  width: 100%;
}

.overlay-content {
  position: absolute;
  width: 100%;
}

h1 {
  color: white;
  margin: 2rem;
  text-align: center;
  font-family: Arial, Helvetica, sans-serif;
}
</style>