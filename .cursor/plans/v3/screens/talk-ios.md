var view = UIView()
view.frame = CGRect(x: 0, y: 0, width: 430, height: 932)

var parent = self.view!
parent.addSubview(view)
view.translatesAutoresizingMaskIntoConstraints = false
view.widthAnchor.constraint(equalToConstant: 430).isActive = true
view.heightAnchor.constraint(equalToConstant: 932).isActive = true
view.leadingAnchor.constraint(equalTo: parent.leadingAnchor, constant: 0).isActive = true
view.topAnchor.constraint(equalTo: parent.topAnchor, constant: 0).isActive = true
