Router.map(function(){
  this.route("home", {path: "/"});
  this.route("about");
});
Router.configure({layoutTemplate: "appBody"});
