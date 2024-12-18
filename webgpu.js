
"use strict";
window.onload = function () {
    main();
};

async function main() {
    /** @type {HTMLCanvasElement} */
    const canvas = document.querySelector("canvas");

    if (!navigator.gpu) {
        throw new Error("WebGPU not supported on this browser.");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error("No appropriate GPUAdapter found.");
    }

    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
    });

    // load script from file
    // this will conflict with CORS policies, please disable those in the browser
    // alternatively copy the code from the shaders.wgsl file directly into the shadermodule
    const response = await fetch("./shaders.wgsl");
    const data = await response.text();

    const wgsl = device.createShaderModule({
        label: "Main shader module",
        code: data,
    });


    const bindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: {
                    type: "uniform",
                },
            },
        ],
    });

    const sceneBindGroupLayout = device.createBindGroupLayout({
        entries: [
            {
                binding: 1,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: {
                    type: "uniform",
                },
            },
        ],
    });


    const pipelineLayout = device.createPipelineLayout({
        bindGroupLayouts: [bindGroupLayout, sceneBindGroupLayout],
    })
    // setup renderpipeline
    const pipeline = device.createRenderPipeline({
        label: "Main render pipeline",
        layout: pipelineLayout,

        vertex: {
            module: wgsl,
            entryPoint: "main_vs",
        },
        fragment: {
            module: wgsl,
            entryPoint: "main_fs",
            targets: [{ format: canvasFormat }],
        },
        primitive: {
            topology: "triangle-strip",
            // GPUPrimitiveTopology { "point-list", "line-list", "line-strip", "triangle-list", "triangle-strip"};
        },
    });

    const uniformBuffer = device.createBuffer({
        size: 4 * 3,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });


    const aspect = canvas.width / canvas.height;
    var cam_const = 1.0;
    const pi = Math.PI;
    var uniforms = new Float32Array([aspect, cam_const, pi]);
    device.queue.writeBuffer(uniformBuffer, 0, uniforms);

    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{
            binding: 0,
            resource: {buffer: uniformBuffer}
        }],
    });

    const scene = get_scene();
    var sceneBufferData = scene.getBufferData();
    const sceneBuffer = device.createBuffer({
        label: "Scene Buffer",
        size: sceneBufferData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    //const arrayBuffer = sceneBuffer.getMappedRange();
    //new Float32Array(arrayBuffer).set(scene.getBufferData());
    //sceneBuffer.unmap();
    device.queue.writeBuffer(sceneBuffer, 0, sceneBufferData);

    const bindGroupScene = device.createBindGroup({
        layout: sceneBindGroupLayout,
        entries: [{
            binding: 1,
            resource: {
                buffer: sceneBuffer,
            },
        }],
    });

    let bindGroups = [bindGroup, bindGroupScene];

    addEventListener("wheel", (event) => {
        cam_const *= 1.0 - 2.5e-4*event.deltaY;
        requestAnimationFrame(animate);
    })

    var isMouseDown = false;
    var intervalId = null;
    var mouseX = 0;
    var mouseY = 0;
    canvas.addEventListener("mousemove", (event) => {
        mouseX = event.clientX;
        mouseY = event.clientY;
    })
    canvas.addEventListener("mousedown", (event) => {
        if (!isMouseDown) {
            isMouseDown = true;
            intervalId = setInterval(() => {
                updateLightPosition(mouseX, mouseY);
            }, 1000 / 60);
        }
    });
    canvas.addEventListener("mouseup", (event) => {
        isMouseDown = false;
        clearInterval(intervalId);
        intervalId = null;
    });

    function updateLightPosition(mouseX, mouseY) {
        let offset = 8;
        let x = (mouseX - offset) - canvas.width / 2;
        let y = -1 * ((mouseY - offset) - canvas.height / 2);
        let x_normalized = x / (canvas.width / 2);
        let y_normalized = y / (canvas.height / 2);
        var point = vec3(intersect_plane(scene, [x_normalized, y_normalized], uniforms));
        point[1] = 1.0;
        scene.point_light.position = point;
        console.log("light_position: ", scene.point_light.position);
        requestAnimationFrame(animate);
    }
    animate();
    function animate() 
    {
        uniforms[1] = cam_const;
        device.queue.writeBuffer(uniformBuffer, 0, uniforms);
        sceneBufferData = scene.getBufferData()
        device.queue.writeBuffer(sceneBuffer, 0, sceneBufferData);
        render(device, context, pipeline, bindGroups);
    }
}


function render(device, context, pipeline, bindGroups) {
    // Create a render pass in a command buffer and submit it
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
        colorAttachments: [
            {
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
            },
        ],
    });
    pass.setBindGroup(0, bindGroups[0]);
    pass.setBindGroup(1, bindGroups[1]);
    pass.setPipeline(pipeline);
    pass.draw(4);
    pass.end();
    device.queue.submit([encoder.finish()]);
}

function get_scene()
{
    var scene = new SceneDescription();

    scene.camera = new Camera();
    scene.camera.eye_point = vec3(2.0, 1.5, 2.0);
    scene.camera.look_at_point = vec3(0.0, 0.5, 0.0);
    scene.camera.up_vector = vec3(0.0, 1.0, 0.0);
    scene.camera.camera_constant = 1.0;

    scene.plane = new Plane();
    scene.plane.position = vec3(0.0, 0.0, 0.0);
    scene.plane.normal = vec3(0.0, 1.0, 0.0);
    scene.plane.rgb_colour = vec3(0.1, 0.7, 0.0);

    scene.triangle = new Triangle();
    scene.triangle.v0 = vec3(-0.2, 0.1, 0.9);
    scene.triangle.v1 = vec3(0.2, 0.1, 0.9);
    scene.triangle.v2 = vec3(-0.2, 0.1, -0.1);
    scene.triangle.rgb_colour = vec3(0.4, 0.3, 0.2);

    scene.sphere = new Sphere();
    scene.sphere.center = vec3(0.0, 0.5, 0.0);
    scene.sphere.radius = 0.3;
    scene.sphere.refractive_index = 1.5;
    scene.sphere.shininess = 42.0;
    scene.sphere.rgb_colour = vec3(0.5, 0.0, 0.5);

    scene.point_light = new PointLight();
    scene.point_light.position = vec3(0.0, 1.0, 0.0);
    scene.point_light.rgb_intensity = vec3(Math.PI, Math.PI, Math.PI);

    return scene;
}

function get_camera_ray(scene, coords, uniforms)
{
    let aspect = uniforms[0];
    let cam_const = uniforms[1];
    var direction = subtract(scene.camera.look_at_point, scene.camera.eye_point);
    direction = normalize(direction);

    let b1 = scale(length(cross(direction, scene.camera.up_vector)), cross(direction, scene.camera.up_vector));
    let b2 = cross(b1, direction);
    let uv = vec2(coords[0] * aspect*0.5, coords[1]*0.5);
    // for some reason scaling by 1.11 works best when positioning the light
    uv = scale(1.11, uv);
    let b1_scaled = scale(uv[0], b1);
    let b2_scaled = scale(uv[1], b2);
    let direction_scaled = scale(cam_const, direction);
    var direction_final = add(add(b1_scaled, b2_scaled), direction_scaled);
    let normalized = normalize(direction_final);
    return normalized;
}

function intersect_plane(scene, coords, uniforms) {
    var direction = get_camera_ray(scene, coords, uniforms);
    let origin = scene.camera.eye_point;
    let plane = scene.plane;
    // check if plane is parallel to ray
    if (dot(plane.normal, direction) == 0) 
    {
        return false;
    }

    let t = dot(subtract(plane.position, origin), plane.normal) / dot(direction, plane.normal); 
    // check if intersection point is behind ray origin
    if (t < 0) {
        return vec3(0.0, 0.0, 0.0);
    }
    else {
        let scaled_direction = scale(t, direction);
        return add(origin, scaled_direction);
    }
}

class SceneDescription
{
    constructor() {
        this.camera = new Camera(),
        this.plane = new Plane(),
        this.triangle = new Triangle(),
        this.sphere = new Sphere(),
        this.point_light = new PointLight()
    }

    getBufferData() {
        const cameraData = this.camera.getBufferData();   // Flatten camera data
        const planeData = this.plane.getBufferData();     // Flatten plane data
        const triangleData = this.triangle.getBufferData(); // Flatten triangle data
        const sphereData = this.sphere.getBufferData();   // Flatten sphere data
        const lightData = this.point_light.getBufferData(); // Flatten light data

        // Concatenate all the arrays into a single Float32Array
        return new Float32Array([
            ...cameraData,
            ...planeData,
            ...triangleData,
            ...sphereData,
            ...lightData
        ]);
    }
};

class Camera 
{
    constructor() {
        this.eye_point = vec3(),
        this.look_at_point = vec3(),
        this.up_vector = vec3(),
        this.camera_constant = new Float32Array(1)
    }

    getBufferData() {
        return new Float32Array([
        ...this.eye_point, 0,
        ...this.look_at_point, 0,
        ...this.up_vector, 0,
        this.camera_constant, 0, 0, 0,
        ]);
    }
};
class Plane
{
    constructor() {
        this.position = vec3(),
        this.normal = vec3(),
        this.rgb_colour = vec3()
    }

    getBufferData() {
        return new Float32Array([
        ...this.position, 0,
        ...this.normal, 0,
        ...this.rgb_colour, 0,
        ]);
    }
};

class Triangle
{
    constructor() {
        this.v0 = vec3(),
        this.v1 = vec3(),
        this.v2 = vec3(),
        this.rgb_colour = vec3()
    }

    getBufferData() {
        return new Float32Array([
        ...this.v0, 0,
        ...this.v1, 0,
        ...this.v2, 0,
        ...this.rgb_colour, 0,
        ]);
    }
};

class Sphere
{
    constructor() {
        this.center = vec3(),
        this.radius = new Float32Array(1),
        this.refractive_index = new Float32Array(1),
        this.shininess = new Float32Array(1),
        this.rgb_colour = vec3()
    }

    getBufferData() {
        return new Float32Array([
        ...this.center, 0,
        this.radius,
        this.refractive_index,
        this.shininess, 0,
        ...this.rgb_colour, 0,
        ]);
    }
};

class PointLight
{
    constructor() {
        this.position = vec3(),
        this.rgb_intensity = vec3()
    }

    getBufferData() {
        return new Float32Array([
        ...this.position, 0,
        ...this.rgb_intensity, 0,
        ]);
    }
};