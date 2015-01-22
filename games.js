Tasks = new Mongo.Collection("tasks");

if (Meteor.isClient) {
  // This code only runs on the client
  Meteor.subscribe("tasks");
  Template.body.helpers({
    tasks: function () {
      if (Session.get("hideCompleted")) {
        return Tasks.find({checked: {$ne: true}}, {sort: {createdAt: -1}});
      } else {
        // Show newest tasks first
        return Tasks.find({}, {sort: {createdAt: -1}});
      }
    },
    hideCompleted: function () {
      return Session.get("hideCompleted");
    },
    incompleteCount: function() {
      return Tasks.find({checked: {$ne: true}}).count();
    },
  });
  Template.task.helpers({
    isOwner: function() {
      return this.owner == Meteor.userId();
    }
  });


  Template.body.events({
    "submit .new-task": function (event) {
      // This function is called when the new task form is submitted
      var text = event.target.text.value;

      Meteor.call("addTask", text);
      //console.log(event);

      // Clear form
      event.target.text.value = "";
      // Prevent default form submit
      return false;
    },
    "change .hide-completed input": function (event) {
      Session.set("hideCompleted", event.target.checked);
    }
  });

  Template.task.events({
    "click .toggle-checked": function () {
      Meteor.call("setChecked", this._id, !this.checked);
    },
    "click .delete": function () {
      Meteor.call("deleteTask", this._id);
    },
    "click .toggle-private": function() {
      Meteor.call("setPrivate", this._id, !this.private);
    },
  });

  Accounts.ui.config({
    passwordSignupFields: "USERNAME_ONLY"
  });
}

Meteor.methods({
  addTask: function (text) {
    // Make sure the user is logged in before inserting a task
    if (! Meteor.userId()) {
      throw new Meteor.Error("not-authorized");
    }

    Tasks.insert({
      text: text,
      createdAt: new Date(),
      owner: Meteor.userId(),
      username: Meteor.user().username
    });
  },
  deleteTask: function (taskId) {
    var task = Tasks.findOne(taskId);
    if (task.private && task.owner !== Mentor.userId()) {
      throw new Mentor.Error("not-authorized");
    }
    Tasks.remove(taskId);
  },
  setChecked: function (taskId, setChecked) {
    var task = Tasks.findOne(taskId);
    if (task.private && task.owner !== Mentor.userId()) {
      throw new Mentor.Error("not-authorized");
    }
    Tasks.update(taskId, { $set: { checked: setChecked} });
  },
  setPrivate: function (taskId, setToPrivate) {
    var task = Tasks.findOne(taskId);
    if (task.owner !== Meteor.userId()) {
      throw new Meteor.Error("not-authorized");
    }
    Tasks.update(taskId, { $set: {private: setToPrivate}});
  },
});

if (Meteor.isServer) {
  Meteor.publish("tasks", function() {
    return Tasks.find({
      $or: [
        { private: {$ne: true}},
        { owner  : this.userId }
      ]
    });
  });
}
