/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by Forge Partner Development
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

// Vanilla JavaScript version of https://forge.autodesk.com/blog/smooth-camera-transitions-forge-viewer

(function () {
    const EASINGS = [
        {
            id: TWEEN.Easing.Linear.None,
            name: 'Linear'
        },

        {
            id: TWEEN.Easing.Quadratic.In,
            name: 'Quadratic.In'
        },
        {
            id: TWEEN.Easing.Quadratic.Out,
            name: 'Quadratic.Out'
        },
        {
            id: TWEEN.Easing.Quadratic.InOut,
            name: 'Quadratic.InOut'
        },

        {
            id: TWEEN.Easing.Cubic.In,
            name: 'Cubic.In'
        },
        {
            id: TWEEN.Easing.Cubic.Out,
            name: 'Cubic.Out'
        },
        {
            id: TWEEN.Easing.Cubic.InOut,
            name: 'Cubic.InOut'
        },


        {
            id: TWEEN.Easing.Quartic.In,
            name: 'Quartic.In'
        },
        {
            id: TWEEN.Easing.Quartic.Out,
            name: 'Quartic.Out'
        },
        {
            id: TWEEN.Easing.Quartic.InOut,
            name: 'Quartic.InOut'
        },

        {
            id: TWEEN.Easing.Quintic.In,
            name: 'Quintic.In'
        },
        {
            id: TWEEN.Easing.Quintic.Out,
            name: 'Quintic.Out'
        },
        {
            id: TWEEN.Easing.Quintic.InOut,
            name: 'Quintic.InOut'
        },

        {
            id: TWEEN.Easing.Exponential.In,
            name: 'Exponential.In'
        },
        {
            id: TWEEN.Easing.Exponential.Out,
            name: 'Exponential.Out'
        },
        {
            id: TWEEN.Easing.Exponential.InOut,
            name: 'Exponential.InOut'
        }
    ];

    const CAMERA_TWEEN_ANIMATION_COMPLETED_EVENT = 'AdnCameraTweenAnimationCompleted';

    class CameraTweenToolExtension extends Autodesk.Viewing.Extension {
        constructor(viewer, options) {
            super(viewer, options);

            this.targetTweenDuration = 4500;
            this.posTweenDuration = 4500;
            this.upTweenDuration = 4500;
            this.tweens = [];

            this.targetTweenEasing = this.getTweenEasingByName('Linear');
            this.posTweenEasing = this.getTweenEasingByName('Linear');
            this.upTweenEasing = this.getTweenEasingByName('Linear');

            this.runAnimation = this.runAnimation.bind(this);
        }

        get supportedTweenEasings() {
            return EASINGS.concat();
        }

        getTweenEasingByName(name) {
            return EASINGS.find(es => es.name === name);
        }

        createTween(params) {
            return new Promise((resolve) => {
                const tween = new TWEEN.Tween(params.object)
                    .to(params.to, params.duration)
                    .onComplete(() => resolve())
                    .onUpdate(params.onUpdate)
                    .easing(params.easing)
                    .start();

                this.tweens.push(tween);
            });
        }

        tweenCameraTo(state, immediate) {
            const targetEnd = new THREE.Vector3(
                state.viewport.target[0],
                state.viewport.target[1],
                state.viewport.target[2]
            );

            const posEnd = new THREE.Vector3(
                state.viewport.eye[0],
                state.viewport.eye[1],
                state.viewport.eye[2]
            );

            const upEnd = new THREE.Vector3(
                state.viewport.up[0],
                state.viewport.up[1],
                state.viewport.up[2]
            );

            const nav = this.viewer.navigation;
            const target = new THREE.Vector3().copy(nav.getTarget());
            const pos = new THREE.Vector3().copy(nav.getPosition());
            const up = new THREE.Vector3().copy(nav.getCameraUpVector());

            const targetTween = this.createTween({
                easing: this.targetTweenEasing.id,
                onUpdate: (v) => {
                    nav.setTarget(v)
                },
                duration: immediate ? 0 : this.targetTweenDuration,
                object: target,
                to: targetEnd
            });

            const posTween = this.createTween({
                easing: this.posTweenEasing.id,
                onUpdate: (v) => {
                    nav.setPosition(v)
                },
                duration: immediate ? 0 : this.posTweenDuration,
                object: pos,
                to: posEnd
            });

            const upTween = this.createTween({
                easing: this.upTweenEasing.id,
                onUpdate: (v) => {
                    nav.setCameraUpVector(v)
                },
                duration: immediate ? 0 : this.upTweenDuration,
                object: up,
                to: upEnd
            });

            Promise.all([
                targetTween,
                posTween,
                upTween
            ])
                .then(() => {
                    this.stopAnimation();

                    this.viewer.fireEvent({
                        type: CAMERA_TWEEN_ANIMATION_COMPLETED_EVENT,
                        status: 'completed'
                    });
                });

            this.startAnimation();
        }

        stopAnimation() {
            this.animate = false;
            while (this.tweens.length > 0) {
                this.tweens.pop();
            }

            if (this.animId)
                window.cancelAnimationFrame(this.animId);
        }

        pauseAnimation() {
            this.animate = false;
            this.tweens.forEach(t => t.pause());
        }

        resumeAnimation() {
            this.animate = true;
            this.tweens.forEach(t => t.resume());
        }

        startAnimation() {
            this.animate = true;
            this.runAnimation();
        }

        toggleAnimation() {
            if (this.animate) {
                this.pauseAnimation();
            } else {
                this.resumeAnimation();
            }
        }

        runAnimation() {
            this.animId = window.requestAnimationFrame(this.runAnimation);

            if (this.animate) {
                TWEEN.update();
            }
        }

        getState(viewerState) {
            const viewport = Object.assign({}, viewerState.viewport, {});

            viewerState.cameraTween = {
                viewport
            };
        }

        restoreState(viewerState, immediate) {
            if (!viewerState.cameraTween) return;

            this.tweenCameraTo(
                viewerState.cameraTween,
                immediate
            );
        }

        load() {
            console.log('CameraTweenToolExtension has been loaded.');
            return true;
        }

        unload() {
            if (this.animId) {
                window.cancelAnimationFrame(this.animId);
            }

            console.log('CameraTweenToolExtension has been unloaded.');
            return true;
        }
    }

    AutodeskNamespace('Autodesk.ADN.CameraTweenTool');
    Autodesk.ADN.CameraTweenTool.CAMERA_TWEEN_ANIMATION_COMPLETED_EVENT = CAMERA_TWEEN_ANIMATION_COMPLETED_EVENT;

    Autodesk.Viewing.theExtensionManager.registerExtension('Autodesk.ADN.CameraTweenTool', CameraTweenToolExtension);
})();