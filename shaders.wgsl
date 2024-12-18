struct Uniforms 
{
    aspect: f32,
    cam_const: f32,
    pi: f32,
};

struct HitInfo {
    has_hit: bool,
    dist: f32,
    position: vec3f,
    normal: vec3f,
    color: vec3f,
};

struct Ray
{
    origin: vec3f,
    direction: vec3f,
    tmin: f32,
    tmax: f32
};

struct VSOut
{
    @builtin(position) position : vec4f,
    @location(0)       coords   : vec2f,
};

struct SceneDescription
{
    camera: Camera,
    plane: Plane,
    triangle: Triangle,
    sphere: Sphere,
    point_light: PointLight,
};

struct Camera 
{
    eye_point: vec3f,
    _padding1: f32,
    look_at_point: vec3f,
    _padding2: f32,
    up_vector: vec3f,
    _padding3: f32,
    camera_constant: f32,
    _padding4: f32,
    _padding5: f32,
    _padding6: f32,
};

struct Plane
{
    position: vec3f,
    _padding1: f32,
    normal: vec3f,
    _padding2: f32,
    rgb_colour: vec3f,
    _padding3: f32,
};

struct Triangle
{
    v0: vec3f,
    _padding1: f32,
    v1: vec3f,
    _padding2: f32,
    v2: vec3f,
    _padding3: f32,
    rgb_colour: vec3f,
    _padding4: f32,
};

struct Sphere
{
    center: vec3f,
    _padding1: f32,
    radius: f32,
    refractive_index: f32,
    shininess: f32,
    _padding2: f32,
    rgb_colour: vec3f,
    _padding3: f32,
};

struct PointLight
{
    position: vec3f,
    _padding1: f32,
    rgb_intensity: vec3f,
    _padding2: f32,
};

struct Light
{
    L_i: vec3f,
    w_i: vec3f,
    dist: f32,
};



@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(1) @binding(1) var<uniform> scene : SceneDescription;

@vertex
fn main_vs(@builtin(vertex_index) VertexIndex : u32) -> VSOut
{ 
    let pos = array<vec2f, 4>(vec2f(-1.0, -1.0), 
                              vec2f(-1.0, 1.0), 
                              vec2f(1.0, -1.0), 
                              vec2f(1.0, 1.0));

    var vsOut = VSOut();
    vsOut.position = vec4f(pos[VertexIndex], 0.0, 1.0);
    vsOut.coords = pos[VertexIndex];

    return vsOut;
} 

@fragment 
fn main_fs(@location(0) coords: vec2f) -> @location(0) vec4f
{ 
    let background = vec4f(0.1, 0.3, 0.6, 1.0);
    let uv = vec2f(coords.x * uniforms.aspect*0.5, coords.y*0.5);
    var ray = get_camera_ray(uv);
    var hit: HitInfo;
    hit.has_hit = false;
    var result = vec3f(0.0);

    let max_depth = 1;
    for (var i = 0; i < max_depth; i++)
    {
        if (intersect_scene(&ray, &hit))
        {
            result += shade(&ray, &hit);
        }
        else 
        {
            result += background.rgb;
            break;
        }
    }

    return vec4f(result, background.a);
}

fn shade(ray: ptr<function, Ray>, hit: ptr<function, HitInfo>) -> vec3f
{
    return lambartian(ray, hit);
}

fn lambartian(ray: ptr<function, Ray>, hit: ptr<function, HitInfo>) -> vec3f
{
    var light = sample_point_light((*hit).position);
    // diffuse reflectance between 0 and 1, no info given, setting to 1
    let diffuse_reflectance = 1.0;
    let diff_div_pi = diffuse_reflectance / uniforms.pi;
    let diffuse_reflect = diff_div_pi * light.L_i * dot((*hit).normal, light.w_i);
    let alternate = diff_div_pi * light.L_i * dot((*hit).normal, light.w_i);
    (*ray).direction = normalize(get_reflection_vector(*ray, (*hit).normal));
    (*ray).origin = (*hit).position;

    return (*hit).color * diffuse_reflect;
}

fn sample_point_light(surface_point: vec3f) -> Light
{

    var light = Light();
    let w_i = scene.point_light.position - surface_point;
    light.w_i = normalize(w_i);
    light.dist = length(w_i);
    light.L_i = scene.point_light.rgb_intensity / pow(light.dist, 2);
    return light;
}

fn get_reflection_vector(ray: Ray, surface_normal: vec3f) -> vec3f
{
    return ray.direction - (dot(2 * ray.direction, surface_normal) / pow(length(surface_normal), 2)) * surface_normal;
}

fn get_camera_ray(ipcoords: vec2f) -> Ray
{
    var ray: Ray;
    ray.origin = scene.camera.eye_point;
    ray.tmin = 0.0;
    ray.tmax = 100.0;

    var direction = scene.camera.look_at_point - ray.origin;
    direction = normalize(direction);

    let b1 = cross(direction, scene.camera.up_vector) / length(cross(direction, scene.camera.up_vector));
    let b2 = cross(b1, direction);
    direction = direction * uniforms.cam_const + b1 * ipcoords.x + b2 * ipcoords.y;
    ray.direction = normalize(direction);
    return ray;
}

fn intersect_scene(ray: ptr<function, Ray>, hit: ptr<function, HitInfo>) -> bool
{
    intersect_plane(ray, hit);
    intersect_triangle(ray, hit);
    intersect_sphere(ray, hit);
    return (*hit).has_hit;
}

fn get_point_on_ray(ray: Ray, t: f32) -> vec3f 
{
    return scene.camera.eye_point + ray.direction * t;
}


fn intersect_plane(ray: ptr<function, Ray>, hit: ptr<function, HitInfo>) -> bool
{
    let plane = scene.plane;
    // check if plane is parallel to ray
    if (dot(plane.normal, ray.direction) == 0) 
    {
        return false;
    }

    let d = -1 * plane.normal * plane.position;
    let t = dot((plane.position - ray.origin), plane.normal) / dot(ray.direction, plane.normal); 
    // check if intersection point is behind ray origin
    if (t < 0) {
        return false;
    }
    let distance = length(t * ray.direction);
    if (distance > ray.tmax) {
        return false;
    }

    (*hit).has_hit = true;
    (*hit).dist = length(t * ray.direction);
    (*hit).color = plane.rgb_colour;
    (*hit).normal = normalize(plane.normal);
    (*hit).position = ray.origin + ray.direction * t;
    (*ray).tmax = hit.dist;

    return true;
}

fn intersect_triangle(ray: ptr<function, Ray>, hit: ptr<function, HitInfo>) -> bool
{
    let tri = scene.triangle;
    let e0 = tri.v1 - tri.v0;
    let e1 = tri.v2 - tri.v0;
    let normal = cross(e0, e1);
    let tri_plane_intersect = dot((tri.v0 - ray.origin), normal) / dot(ray.direction, normal);
    let intersect_point = get_point_on_ray(*ray, tri_plane_intersect);

    let beta = dot(cross(tri.v0 - ray.origin, ray.direction), e1) / dot(ray.direction, normal);
    let gamma = -dot(cross(tri.v0 - ray.origin, ray.direction), e0) / dot(ray.direction, normal);
    let distance = length(intersect_point - ray.origin);

    if (beta >= 0 && gamma >= 0 && beta + gamma <= 1) {
        if (distance > ray.tmax) {
            return false;
        }
        (*hit).has_hit = true;
        (*hit).dist = distance;
        (*hit).color = scene.triangle.rgb_colour;
        (*hit).normal = normalize(normal);
        (*hit).position = intersect_point;
        (*ray).tmax = hit.dist;
        return true;
    }
    else {
        return false;
    }
}

fn intersect_sphere(ray: ptr<function, Ray>, hit: ptr<function, HitInfo>) -> bool
{
    var sphere = scene.sphere;
    let oc = ray.origin - sphere.center;
    let a = dot(ray.direction, ray.direction);  // This is always 1 if direction is normalized
    let halfB = dot(oc, ray.direction);
    let c = dot(oc, oc) - sphere.radius * sphere.radius;
    
    let discriminant = halfB * halfB - a * c;
    
    if (discriminant < 0.0) {
        return false; // No real roots, no intersection
    }

    let sqrt_discriminant = sqrt(discriminant);
    
    // Find the nearest valid intersection point
    var t1 = (-halfB - sqrt_discriminant) / a;
    var t2 = (-halfB + sqrt_discriminant) / a;
    
    // We need the closest positive t (in front of the ray origin)
    var t_closest = t1;
    if (t1 < ray.tmin || t1 > ray.tmax) {
        t_closest = t2;
    }
    if (t_closest < ray.tmin || t_closest > ray.tmax) {
        return false; // No valid intersection in ray bounds
    }
    
    // Calculate hit details
    let hit_position = ray.origin + ray.direction * t_closest;
    let hit_normal = normalize(hit_position - sphere.center);
    
    (*hit).has_hit = true;
    (*hit).dist = t_closest;
    (*hit).color = sphere.rgb_colour;
    (*hit).position = hit_position;
    (*hit).normal = normalize(hit_normal);
    (*ray).tmax = hit.dist;
    
    return true;
}