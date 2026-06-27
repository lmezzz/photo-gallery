use axum::{
    routing::get,
    Router,
    Json,
    extract::{Query,State},
    http::StatusCode,
};

use tower_http::services::ServeDir;
use walkdir::WalkDir;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;

#[derive(Serialize)]
struct FolderContent {
    images: Vec<String>,
    folders: Vec<String>,
    ttl_images: usize,
    parent_folder:Option<String>,
}

#[derive(Clone)]
struct AppState {
    photos_root: String,
}


#[tokio::main]
async fn main() {

    let photo_root = std::env::var("PHOTOS_DIR").unwrap_or("photos".to_string());
    //nest_service responds to a get request start with /photos here and then wtv is infront of it
    //is fetched from the dir mentioned in the ServeDir ie /photos/test1/a.png
    //so the /photos will be stripped and /test1/a.png will be served from the dir mentioned in the
    //serve dir
    
    let app = Router::new().nest_service("/photos" , ServeDir::new(&photo_root))
        .fallback_service(ServeDir::new("static").append_index_html_on_directories(true))
        .route("/api" , get(respond_for_requested_folder))
        .with_state(AppState {
            photos_root:photo_root,
        });

    let listener =  tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();

    axum::serve(listener , app).await.unwrap();
}

async fn respond_for_requested_folder (State(state): State<AppState> ,Query(params): Query<HashMap<String , String>>)-> Result<Json<FolderContent>, StatusCode> {
    let path = params.get("path").cloned().unwrap_or("photos".to_string());
    
    //PHOTO_ROOT Will be declared as an environment variable when we basically create a Docker
    //but if there is no Declared variable it will loo for photos Dir at the running Dir
    let full_path = if path.is_empty() {
        state.photos_root.clone()
    } else {
        format!("{}/{}",state.photos_root , path)
    };
    
    println!("photos_root: {}", state.photos_root);
    println!("full_path: {}", full_path);
    println!("safe: {}", is_safe_path(&state.photos_root, &full_path));
    

    if !is_safe_path(&state.photos_root , &full_path) {
        return Err(StatusCode::FORBIDDEN);
    }

    let (folders , images) = get_content_of_folder(&full_path, &state.photos_root);
    let ttl = images.len();
    let parent: Option<String> = get_parent_folder(&path); //implemented so that we can go back to
                                                           //the current folders parent directory

    let current_content = FolderContent {
        images,
        folders,
        ttl_images:ttl,
        parent_folder:parent,
    };

    Ok(Json(current_content))
}

fn get_content_of_folder(path: &str , photos_root: &str) -> (Vec<String>, Vec<String>) {
    let mut folders = vec![];
    let mut images = vec![];

    for entry in WalkDir::new(path).max_depth(1) {
        let entry = entry.unwrap();
        if entry.path().is_dir() {
            folders.push(entry.path().strip_prefix(photos_root).unwrap().to_string_lossy().to_string());
        } else {
            images.push(entry.path().strip_prefix(photos_root).unwrap().to_string_lossy().to_string());
        }
    }

    (folders , images)
}

fn get_parent_folder (path: &str) -> Option<String> {
    let entry: Vec<&str> = path.split('/').collect();

    if entry.len() <= 1 {
        None
    } else {
        Some(entry[..entry.len() -1].join("/"))
    }
}

fn is_safe_path(base: &str , requested: &str)-> bool {
    let base = match fs::canonicalize(base) {
        Ok(p) => p,
        Err(_) => return false,
    };
    let requested = match fs::canonicalize(requested) {
        Ok(p) => p,
        Err(_) => return false,
    };

    requested.starts_with(&base)
}

